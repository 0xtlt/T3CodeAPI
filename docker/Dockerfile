FROM node:24.19.0-bookworm-slim

ARG T3CODE_VERSION=0.0.32
ARG OPENCODE_VERSION=1.18.15

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    ca-certificates \
    g++ \
    git \
    make \
    openssh-client \
    python3 \
  && npm install --global --omit=dev --no-update-notifier \
    "t3@${T3CODE_VERSION}" \
    "opencode-ai@${OPENCODE_VERSION}" \
  && npm cache clean --force \
  && t3 --version \
  && opencode --version \
  && apt-get purge --yes --auto-remove g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node docker/configure-opencode.mjs /opt/t3code/configure-opencode.mjs
COPY --chown=node:node docker/entrypoint.sh /opt/t3code/entrypoint.sh

RUN chmod 0555 /opt/t3code/entrypoint.sh \
  && mkdir -p /home/node/.config/opencode /home/node/.t3 /workspace \
  && chown -R node:node /home/node /workspace

USER node
WORKDIR /workspace

ENV HOME=/tmp/t3code-runtime \
  T3CODE_HOME=/tmp/t3code-runtime/.t3 \
  T3CODE_HOST=0.0.0.0 \
  T3CODE_NO_BROWSER=true \
  T3CODE_PORT=3773 \
  T3CODE_OPENROUTER_MODEL=openrouter/deepseek/deepseek-v4-flash-0731

EXPOSE 3773

HEALTHCHECK --interval=2s --timeout=2s --start-period=15s --retries=30 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3773/').then((response) => process.exit(response.status < 500 ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/opt/t3code/entrypoint.sh"]
