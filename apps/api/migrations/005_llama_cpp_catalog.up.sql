INSERT INTO provider_catalog(provider_key, display_name, status, created_at, updated_at)
VALUES ('llama-cpp', 'Local llama.cpp', 'active', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');

INSERT INTO model_catalog(model_key, provider_key, provider_model_id, display_name, status, created_at, updated_at)
VALUES ('llama-cpp:qwen-local', 'llama-cpp', 'qwen-local', 'Qwen 2.5 3B Local', 'active', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
