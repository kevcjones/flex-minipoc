/**
 * Copy this file to config.ts and fill in your values.
 * config.ts is gitignored so your account id and domain stay out of git.
 *
 * Prerequisites (see README):
 *  1. An ACM cert in us-east-1 covering both hosts below (a wildcard is easiest).
 *  2. Two subdomains you control in your DNS provider.
 */
export const REGION = "us-east-1";

// us-east-1 ACM certificate ARN covering PUBLIC_HOST and GATEWAY_HOST.
export const CERT_ARN =
  "arn:aws:acm:us-east-1:<ACCOUNT_ID>:certificate/<CERTIFICATE_ID>";

// Public host the client hits. DNS CNAME -> CloudFront domain (DNS only).
export const PUBLIC_HOST = "app.<your-subdomain>";

// Internal custom domain, CloudFront's single static origin.
// DNS CNAME -> API Gateway regional target (DNS only).
export const GATEWAY_HOST = "gw.<your-subdomain>";

// Domains and routes are discovered from the domains/ folder tree.
// There is no list to maintain here.
