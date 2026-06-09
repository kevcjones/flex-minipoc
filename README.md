# flex-minipoc

A tiny, deployable proof of the Flex front-door idea: one CloudFront
distribution with a single static origin, an API Gateway custom domain behind
it, and two completely independent domain stacks (foo and bar) that each own
their own gateway and self-register a base path on the custom domain.

The point it proves: adding or redeploying a domain waits on nothing and
touches nothing shared except its own base path mapping. Core never changes.

DNS is on Cloudflare, so AWS manages no DNS records here. You create a few
CNAMEs by hand.

## Shape

```
client
  -> CloudFront            (FlexMiniCore, one static origin)
  -> gw.<sub>              API Gateway custom domain
       |-- /foo  ------->  FlexMiniFoo  gateway  -> hello lambda
       |-- /bar  ------->  FlexMiniBar  gateway  -> hello lambda
```

Everything runs in `us-east-1`.

## One-time setup

1. Install deps:
   ```bash
   npm install
   ```

2. Decide two subdomains of a domain you own in Cloudflare, for example
   `app.minipoc.yourdomain.com` (public) and `gw.minipoc.yourdomain.com`
   (origin).

3. Request an ACM certificate in **us-east-1** that covers both. A wildcard
   `*.minipoc.yourdomain.com` is easiest:
   ```bash
   aws acm request-certificate \
     --region us-east-1 \
     --domain-name '*.minipoc.yourdomain.com' \
     --validation-method DNS
   ```
   Read the validation CNAME:
   ```bash
   aws acm describe-certificate --region us-east-1 \
     --certificate-arn <arn> \
     --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
   ```
   Add that CNAME in Cloudflare (DNS only, grey cloud). Wait until the cert
   shows `ISSUED`.

4. Create your local config (gitignored) and fill it in:
   ```bash
   cp config.example.ts config.ts
   # set CERT_ARN, PUBLIC_HOST, GATEWAY_HOST
   ```

5. Confirm the account and bootstrap us-east-1 if needed:
   ```bash
   aws sts get-caller-identity
   npx cdk bootstrap aws://<account-id>/us-east-1
   ```

## Deploy

Core first (it creates the custom domain the others attach to). After that the
domains are independent.

```bash
npm run deploy:core
```

Core prints two outputs. Create these CNAMEs in Cloudflare, both **DNS only**:

| Cloudflare record | Type  | Target                                  |
| ----------------- | ----- | --------------------------------------- |
| `PUBLIC_HOST`     | CNAME | `CloudFrontDomain` output (xxx.cloudfront.net) |
| `GATEWAY_HOST`    | CNAME | `GatewayTarget` output (xxx.execute-api...)    |

DNS only matters: if Cloudflare proxies these (orange cloud) it terminates TLS
with its own cert and rewrites the Host, which breaks the custom domain match.

Then the domains:

```bash
npm run deploy:foo
npm run deploy:bar
```

To see the independence: change the foo lambda message and `npm run deploy:foo`
again. Core and bar are untouched, and nothing waits.

## Adding a new domain later (the point of the POC)

Once the one-time DNS is in place (the cert validation CNAME and the `app` and
`gw` CNAMEs), onboarding another domain touches no DNS at all, because domains
are base paths under the one custom domain, not subdomains.

1. Add the name to `DOMAINS` in `config.ts`:
   ```ts
   export const DOMAINS = ["foo", "bar", "zar"];
   ```
2. Deploy only the new stack:
   ```bash
   npx cdk deploy FlexMiniZar
   ```
3. It works immediately:
   ```bash
   curl https://app.minipoc.yourdomain.com/zar/hello
   # {"domain":"zar","message":"hello from zar"}
   ```

Core, foo, and bar are not redeployed. No CNAME, no cert change, no front-door
change. The new gateway simply self-registers `/zar` on the existing custom
domain. That is the property the POC is here to demonstrate.

## Test

Give CloudFront and the new CNAMEs a few minutes to settle.

```bash
curl https://app.minipoc.yourdomain.com/foo/hello
# {"domain":"foo","message":"hello from foo"}

curl https://app.minipoc.yourdomain.com/bar/hello
# {"domain":"bar","message":"hello from bar"}
```

## Teardown

```bash
npm run destroy
```

Then remove the CNAMEs and the ACM validation record from Cloudflare, and
delete the ACM cert.

## Notes and known rough edges

- The custom domain is the single CloudFront origin, so CloudFront never changes
  when domains are added. The fan-out is entirely at the custom domain.
- CloudFront origin is `GATEWAY_HOST`, so the request reaches API Gateway with
  the custom domain as its Host. If a base path returns 403 or a missing-mapping
  error, the Host is the first thing to check.
- For faithfulness to real Flex you would add the origin-verify WAF check and an
  authorizer. They are intentionally omitted here to keep the POC minimal.
