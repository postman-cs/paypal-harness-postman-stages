# Approved Harness KubernetesDirect step image: Node 24 + signed Postman CLI +
# the Postman-CS pipeline scripts, pre-baked so no runtime curl-pipe
# installation ever happens in a stage and customer codebases need not vendor
# our scripts. Build from the REPO ROOT so the scripts are in context:
#   docker build --platform linux/amd64 -f docker/postman-tools/Dockerfile \
#     -t paypal-harness/postman-tools:node24 .
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

# Pipeline scripts version-locked to this image, with their one runtime
# dependency vendored beside them so they run without any repo checkout.
# Stages prefer these baked copies; repo-local copies are the dev fallback.
COPY scripts/ensure-postman-assets.mjs scripts/compare-routes.mjs /opt/postman-cs/
RUN cd /opt/postman-cs \
  && npm init -y >/dev/null 2>&1 \
  && npm install --no-audit --no-fund yaml@2.8.1 >/dev/null \
  && node --input-type=module -e "await import('yaml'); console.log('yaml vendored OK')"

CMD ["bash"]
