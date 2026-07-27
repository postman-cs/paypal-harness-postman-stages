# Approved Harness KubernetesDirect step image: Node 24 + signed Postman CLI,
# pre-baked so no runtime curl-pipe installation ever happens in a stage.
# Build:  docker build --platform linux/amd64 -t paypal-harness/postman-tools:node24 .
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git jq unzip \
  && rm -rf /var/lib/apt/lists/*

# Official signed Postman CLI artifact. The tarball ships the binary as
# `postman-cli` plus its lib/ runtime; the canonical stage gate checks
# `command -v postman`, so expose both names.
ARG POSTMAN_CLI_URL=https://dl-cli.pstmn.io/download/latest/linux64
RUN curl -fsSL -o /tmp/postman-cli.tar.gz "$POSTMAN_CLI_URL" \
  && sha256sum /tmp/postman-cli.tar.gz | tee /opt/postman-cli.tar.gz.sha256 \
  && mkdir -p /opt/postman \
  && tar -xzf /tmp/postman-cli.tar.gz -C /opt/postman \
  && chmod 0755 /opt/postman/postman-cli \
  && ln -s /opt/postman/postman-cli /usr/local/bin/postman \
  && ln -s /opt/postman/postman-cli /usr/local/bin/postman-cli \
  && rm /tmp/postman-cli.tar.gz \
  && postman --version \
  && node --version

CMD ["bash"]
