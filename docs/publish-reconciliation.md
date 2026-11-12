# Recovery after an uncertain publish

An ambiguous transient transport failure can mean that the platform accepted a
create but its response was lost. `PostActivity` persists
`settings.publishAttemptUncertainAt` before rethrowing. The value is the attempt's
start time, stored after the failure, so a slow request does not move the lookup
window past the accepted publication. Proven before-connect errors and other
errors do not set it. The existing JSON text column is sufficient; no schema
change, Prisma generation, or deployment schema job is required.

On retry the activity reads persisted receipts and settings, rather than stale
workflow inputs. With an uncertainty marker and a provider lookup, it scans from
five minutes before the marker. A match is persisted with `updatePost` before the
marker is cleared. A successful lookup with no match clears the marker and allows
a create. Any lookup error (including permission errors, malformed responses, or
incomplete pagination) becomes a retryable `publication_lookup` failure and leaves
the marker intact. Settings writes use compare-and-swap to preserve concurrent
settings edits. A receipt already persisted by another attempt also clears a stale
marker before returning success.

Threads replies reconcile independently of the main post. The lookup uses the
reply's immediate parent (`lastPostId || postId`), and requires both that parent
and the connected account's username. Other providers' comments retain their
existing behavior. Providers without a lookup retain their current retry behavior.
Facebook and Instagram stories retain their existing container/receipt behavior;
feed listings cannot establish story publication.

## Provider requests

The lookups reuse the host, version and authentication conventions of the existing
create/read code. No live API calls were used to implement or test them.

| Provider             | Read                                                | Authentication/version                              |
| -------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Threads              | `/{user-id}/threads`, `/{parent-id}/replies`        | `graph.threads.net/v1.0`, `access_token`            |
| Facebook Page        | `/{page-id}/published_posts`                        | `graph.facebook.com/v25.0`, `access_token`          |
| Instagram            | `/{ig-user-id}/media`                               | `graph.facebook.com/v25.0`, `access_token`          |
| Instagram Standalone | `/{ig-user-id}/media`                               | `graph.instagram.com/v25.0`, `access_token`         |
| LinkedIn Page        | `/rest/posts?q=author&author=urn:li:organization:…` | Bearer, `Linkedin-Version: 202601`, Rest.li `2.0.0` |

Meta lookups read ID, text/message/caption, timestamp and permalink, plus media
metadata where available. Threads replies also read username and replied-to ID.
LinkedIn reads published posts by the exact organization author, using commentary
and publication/creation time. Media counts distinguish carousels where available;
LinkedIn image-to-PDF carousels compare as one published attachment.

Meta pagination follows cursors on the original host, not the supplied next URL.
Recent-first Meta scans stop after a whole page predates the lookup window;
Threads reply scans do not assume chronological ordering.
LinkedIn follows explicit next offsets/total counts on the original host and scans
in last-modified order and can stop when a whole page's modification
times predate the window. Both fail closed after 20 pages (100 entries requested
per page); an incomplete scan never authorizes a create.

## Matching rule and limitations

HTML is decoded to plain text; paragraph/div/list/br boundaries become spaces,
whitespace collapses, and comparison is case-sensitive over the first 280 Unicode
characters. Longer text must have an equal 280-character prefix. Short text must
match exactly; arbitrary caption truncation is not accepted.

Threads and Instagram remove every HTTP(S) URL through the next whitespace from
both sides _before_ comparison. This tolerates shortened, truncated, changed or
omitted URLs. Facebook and LinkedIn retain URL identity. LinkedIn's expected text
uses its existing commentary escaping. If a complete media count is available,
it must also match; incomplete nested media pagination does not invent a count.

This is heuristic reconciliation, not platform idempotency. Identical text prefixes
(and media counts), including empty captions or URL-only text after URL removal,
can match another recent publication. A platform that has not yet exposed an
accepted post in its listing can still lead to a duplicate after a successful
empty lookup. Account read permissions, API field availability and indexing delay
remain unverified against live accounts.

The actual create may be deferred to `finalizePost`, so pending activity responses
carry an internal `__publicationPost` receipt baseline through status/finalization
phases. This preserves intentional repeat occurrences and enables the same
reconciliation before both status checks and finalization retries. The workflow
polls status after a failed finalization, so recovering only inside the finalizer
would miss that path. A successful empty lookup disarms LinkedIn Page's previous
interrupted-create handshake so the normal arm/witness/create sequence can resume;
a failed lookup leaves that guard intact. Old in-flight histories without a row
identity continue using provider container/status recovery; receipt-aware
finalizers can use their explicit post ID. No workflow definitions were changed.
