# Security reporting

Please use GitHub's private vulnerability reporting on the repository's **Security → Advisories → Report a vulnerability** page if it is available. Include the affected version, reproduction, impact, and a proposed mitigation. Do not include real credentials or customer data.

If private reporting is unavailable, open an issue requesting a private reporting channel without disclosing the vulnerability or exploit. No response-time guarantee is offered.

## Application responsibilities

Validation and typed calls do not replace authentication, resource authorization, CSRF policy, rate limits, transaction design, or deployment configuration. Every generated action route is an HTTP endpoint. Validate business rules on the server, expose only intentional errors, and return explicit public output fields.

Use a server-side session check and verify ownership for each requested resource. Cancellation cannot undo work already performed by the server. Design idempotency before retrying mutations. Avoid logging raw sensitive inputs or returning unexpected exception details.
