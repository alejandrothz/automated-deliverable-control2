#!/bin/bash
# =====================================================================
# setup.sh — Automated Deliverable Control (Dia 1)
#
# Monta toda la infraestructura del Dia 1 en un proyecto NUEVO de GCP.
# Se ejecuta desde la raiz del repositorio, en Cloud Shell:
#     bash setup.sh
#
# Hecho por consola (este script NO lo cubre):
#   - Crear el proyecto y vincular la cuenta de facturacion.
#   - Alerta de presupuesto: 5 USD, solo alertas, umbrales 50/90/100 %.
# =====================================================================

set -euo pipefail   # detener el script ante el primer error

# --- Variables -------------------------------------------------------
PROJECT_ID="automated-deliverable-control"
REGION="us-central1"                      # todo en la misma region
BUCKET="entregables-${PROJECT_ID}"        # nombre unico en todo GCP
FUNCTION="procesar-entregable"
TEST_USER="usuario-prueba@gmail.com"      # CAMBIAR por la cuenta de prueba

SA_RUN="sa-procesador@${PROJECT_ID}.iam.gserviceaccount.com"
SA_TRIGGER="sa-eventarc@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')


# --- 1. APIs ---------------------------------------------------------
# El reto pide storage, functions, pubsub, logging y build.
# run, eventarc y artifactregistry no estan en la lista, pero sin ellas
# una funcion con trigger de Storage no se puede desplegar.
gcloud services enable \
  storage.googleapis.com cloudfunctions.googleapis.com \
  run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com \
  logging.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com


# --- 2. Identidades (minimo privilegio) --------------------------------

# Identidad con la que corre la funcion. SIN roles: el evento ya trae
# los metadatos del archivo, asi que no necesita leer el bucket.
gcloud iam service-accounts create sa-procesador \
  --display-name="Runtime de la Cloud Function"

# Identidad con la que Eventarc entrega los eventos.
gcloud iam service-accounts create sa-eventarc \
  --display-name="Identidad del trigger de Eventarc"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --quiet \
  --member="serviceAccount:${SA_TRIGGER}" \
  --role="roles/eventarc.eventReceiver"

# Agente de Cloud Storage: publica en Pub/Sub el aviso de que llego un archivo.
GCS_AGENT=$(gcloud storage service-agent --project="$PROJECT_ID")
gcloud projects add-iam-policy-binding "$PROJECT_ID" --quiet \
  --member="serviceAccount:${GCS_AGENT}" \
  --role="roles/pubsub.publisher"

# Agente de Eventarc: se asegura de que exista (incidencia D1-02).
gcloud beta services identity create --service=eventarc.googleapis.com

# Cuenta de build: la organizacion no le da permisos automaticos (D1-01).
gcloud projects add-iam-policy-binding "$PROJECT_ID" --quiet \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"

# Los permisos de IAM tardan en propagarse (P-02 y D1-02).
echo "Esperando propagacion de permisos IAM..."
sleep 90


# --- 3. Bucket -------------------------------------------------------
# Privado, acceso uniforme y en la misma region que la funcion.
gcloud storage buckets create "gs://${BUCKET}" \
  --location="$REGION" \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access \
  --public-access-prevention

# Ciclo de vida: Nearline a los 7 dias y borrado a los 30.
cat > /tmp/lifecycle.json << 'EOF'
{
  "rule": [
    {"action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
     "condition": {"age": 7, "matchesStorageClass": ["STANDARD"]}},
    {"action": {"type": "Delete"},
     "condition": {"age": 30}}
  ]
}
EOF
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file=/tmp/lifecycle.json

# Usuario de prueba: solo puede subir archivos (sin ver, borrar ni sobrescribir).
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="user:${TEST_USER}" \
  --role="roles/storage.objectCreator"


# --- 4. Cloud Function -------------------------------------------------
# El trigger se crea en el mismo comando que la funcion (P-06).
# --entry-point debe coincidir con el nombre de la funcion en main.py (P-01).
gcloud functions deploy "$FUNCTION" --quiet \
  --gen2 \
  --runtime=python312 \
  --region="$REGION" \
  --source=./cloud-function \
  --entry-point=procesar \
  --trigger-event-filters="type=google.cloud.storage.object.v1.finalized" \
  --trigger-event-filters="bucket=${BUCKET}" \
  --trigger-location="$REGION" \
  --service-account="$SA_RUN" \
  --trigger-service-account="$SA_TRIGGER" \
  --memory=256Mi \
  --max-instances=3

# Permiso para invocar SOLO esta funcion, antes de subir archivos (P-03).
gcloud functions add-invoker-policy-binding "$FUNCTION" \
  --region="$REGION" \
  --member="serviceAccount:${SA_TRIGGER}"

echo "Listo. Prueba: gcloud storage cp informe-01.pdf gs://${BUCKET}/"
