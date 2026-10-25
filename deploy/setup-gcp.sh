#!/usr/bin/env bash
# One-time Google Cloud setup for deploying POFU to Cloud Run from GitHub Actions.
# Run in Google Cloud Shell (or anywhere gcloud is logged in as a project Owner):
#
#   PROJECT_ID=my-project ./deploy/setup-gcp.sh
#
# Optional: REGION (default us-central1), SERVICE (default pofu), GITHUB_REPO (default IntalentAI/POFU).
# Safe to re-run: every step checks before creating.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, e.g. PROJECT_ID=my-project ./deploy/setup-gcp.sh}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-pofu}"
GITHUB_REPO="${GITHUB_REPO:-IntalentAI/POFU}"
BUCKET="${BUCKET:-$PROJECT_ID-$SERVICE-db}"
POOL=github
PROVIDER=github

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="$SERVICE-runtime@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOY_SA="$SERVICE-deployer@$PROJECT_ID.iam.gserviceaccount.com"

say "Enabling APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  cloudscheduler.googleapis.com iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com

say "Artifact Registry repository: $SERVICE ($REGION)"
gcloud artifacts repositories describe "$SERVICE" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$SERVICE" --repository-format=docker --location "$REGION" \
    --description "POFU container images"

say "Database backup bucket: gs://$BUCKET"
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 ||
  gcloud storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access --public-access-prevention

say "Service accounts"
gcloud iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SERVICE-runtime" --display-name "POFU Cloud Run runtime"
gcloud iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SERVICE-deployer" --display-name "POFU GitHub Actions deployer"

say "Secrets"
for name in auth-secret cron-secret; do
  secret="$SERVICE-$name"
  gcloud secrets describe "$secret" >/dev/null 2>&1 ||
    openssl rand -base64 48 | tr -d '\n/+=' | gcloud secrets create "$secret" --replication-policy automatic --data-file=-
  gcloud secrets add-iam-policy-binding "$secret" --member "serviceAccount:$RUNTIME_SA" \
    --role roles/secretmanager.secretAccessor >/dev/null
done
# The workflow reads the cron secret to configure Cloud Scheduler.
gcloud secrets add-iam-policy-binding "$SERVICE-cron-secret" --member "serviceAccount:$DEPLOY_SA" \
  --role roles/secretmanager.secretAccessor >/dev/null

say "Permissions"
# Runtime: read/write the database replica only.
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$RUNTIME_SA" \
  --role roles/storage.objectAdmin >/dev/null
# Deployer: push images, deploy the service, act as the runtime account, manage scheduler jobs.
gcloud artifacts repositories add-iam-policy-binding "$SERVICE" --location "$REGION" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/artifactregistry.writer >/dev/null
for role in roles/run.admin roles/cloudscheduler.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" \
    --role "$role" --condition=None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --member "serviceAccount:$DEPLOY_SA" \
  --role roles/iam.serviceAccountUser >/dev/null

say "Workload Identity Federation for GitHub ($GITHUB_REPO)"
gcloud iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location global --workload-identity-pool "$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location global --workload-identity-pool "$POOL" \
    --display-name "GitHub" --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '$GITHUB_REPO'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$GITHUB_REPO" >/dev/null

WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"

say "Done. Add these as GitHub repository VARIABLES (Settings → Secrets and variables → Actions → Variables):"
cat <<EOF

  GCP_PROJECT_ID     = $PROJECT_ID
  GCP_REGION         = $REGION
  GCP_WIF_PROVIDER   = $WIF_PROVIDER
  GCP_DEPLOY_SA      = $DEPLOY_SA
  GCP_RUNTIME_SA     = $RUNTIME_SA
  LITESTREAM_BUCKET  = $BUCKET
  SEED_DEMO          = true    (optional: load the Acme demo workspace on the very first deploy)

EOF

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  read -r -p "gh CLI is logged in — set these variables on $GITHUB_REPO now? [y/N] " yn
  if [[ "$yn" =~ ^[Yy]$ ]]; then
    gh variable set GCP_PROJECT_ID --repo "$GITHUB_REPO" --body "$PROJECT_ID"
    gh variable set GCP_REGION --repo "$GITHUB_REPO" --body "$REGION"
    gh variable set GCP_WIF_PROVIDER --repo "$GITHUB_REPO" --body "$WIF_PROVIDER"
    gh variable set GCP_DEPLOY_SA --repo "$GITHUB_REPO" --body "$DEPLOY_SA"
    gh variable set GCP_RUNTIME_SA --repo "$GITHUB_REPO" --body "$RUNTIME_SA"
    gh variable set LITESTREAM_BUCKET --repo "$GITHUB_REPO" --body "$BUCKET"
    echo "Variables set. Push to main (or re-run the workflow) to deploy."
  fi
fi
