# Dockerfile for vLLM with Git LFS support
FROM vllm/vllm-openai:v0.10.0
# latest : 0.26.0

RUN apt-get update && \
    apt-get install -y --no-install-recommends git git-lfs && \
    git lfs install && \
    rm -rf /var/lib/apt/lists/*

# 핵심: 기본 ENTRYPOINT 제거 → 아무 명령이나 실행 가능해짐
ENTRYPOINT []
CMD ["sleep", "infinity"]