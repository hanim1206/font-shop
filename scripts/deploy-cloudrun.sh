#!/usr/bin/env bash
# .env.local 값으로 Cloud Build 에서 이미지를 만들어 Cloud Run 에 배포한다. Docker 가 없어도 된다.
#   scripts/deploy-cloudrun.sh                       첫 배포
#   scripts/deploy-cloudrun.sh https://주소.run.app   SITE_URL 을 넣어 다시 배포
#   scripts/deploy-cloudrun.sh --env-only            환경변수 파일만 만들고 끝낸다
set -euo pipefail

REGION=asia-northeast3
SERVICE=font-shop
REPO=font-shop
ENV_FILE=.env.cloudrun.yaml

cd "$(dirname "$0")/.."
SITE_URL="${1:-}"

# 값이 터미널에 찍히지 않도록 파일로만 쓴다. JSON 은 올바른 YAML 이다.
ENV_ONLY="$([ "$SITE_URL" = "--env-only" ] && echo 1 || true)"
[ -n "$ENV_ONLY" ] && SITE_URL=""
SITE_URL="$SITE_URL" ENV_FILE="$ENV_FILE" node -e '
  const fs = require("fs");
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const value = m[2].replace(/\s+#.*$/, "").trim();
    if (value) env[m[1]] = value;
  }
  delete env.PYTHON; // 이미지가 정한 값을 쓴다
  if (process.env.SITE_URL) env.SITE_URL = process.env.SITE_URL;
  else delete env.SITE_URL;
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_TOSS_CLIENT_KEY", "TOSS_SECRET_KEY", "FONTMARK_SECRET"]) {
    if (!env[key]) throw new Error(key + " 이 .env.local 에 없습니다");
  }
  fs.writeFileSync(process.env.ENV_FILE, JSON.stringify(env, null, 2) + "\n", { mode: 0o600 });
  console.log(Object.keys(env).length + "개 환경변수를 " + process.env.ENV_FILE + " 에 썼습니다");
'
[ -n "$ENV_ONLY" ] && exit 0

read_env() { sed -n "s/^$1=//p" .env.local | head -1; }

PROJECT="$(gcloud config get-value project 2>/dev/null)"
[ -n "$PROJECT" ] || { echo "gcloud config set project <프로젝트 ID> 를 먼저 실행하세요" >&2; exit 1; }
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/web:latest"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REGION"

gcloud builds submit --config cloudbuild.yaml --substitutions "^|^_IMAGE=$IMAGE|_SUPABASE_URL=$(read_env NEXT_PUBLIC_SUPABASE_URL)|_SUPABASE_PUBLISHABLE_KEY=$(read_env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)|_TOSS_CLIENT_KEY=$(read_env NEXT_PUBLIC_TOSS_CLIENT_KEY)|_SELLER_EMAIL=$(read_env NEXT_PUBLIC_SELLER_EMAIL)"

# 미리보기 글자 제한이 서버 메모리에 있어 인스턴스는 하나만 둔다
gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" \
  --port 8080 --memory 1Gi --cpu 1 --timeout 120 \
  --min-instances 0 --max-instances 1 \
  --allow-unauthenticated --env-vars-file "$ENV_FILE"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "배포 주소: $URL"
[ -n "$SITE_URL" ] || echo "SITE_URL 을 넣으려면: gcloud run services update $SERVICE --region $REGION --update-env-vars SITE_URL=$URL"
