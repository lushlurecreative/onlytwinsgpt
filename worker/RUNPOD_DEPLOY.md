# Deploy this worker to RunPod Serverless (GitHub)

1. RunPod Console → Serverless → **New Endpoint**
2. **Import Git Repository** → select this repo → **Branch:** main
3. **Dockerfile path:** `worker/Dockerfile.serverless`
4. **Build context** (if asked): leave default or `worker`
5. Add **Environment variables** on the endpoint:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `HF_TOKEN` (for FLUX.1-dev)
6. **Deploy Endpoint** → copy the **Endpoint ID** → paste in Admin → GPU Worker
