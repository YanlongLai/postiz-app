# Approved service hardening

Owner approved improvements 1-5 and confirmed item 5 as existing gateway fallback
verification and isolated database restore. No new VM, production DB migration,
public IP/Bastion restoration, automatic social publication or paid provider.

## Scope and acceptance

1. Integrate exact upstream v2.25.0 source 8e42f09cb45c3b6be16656c2d23a372d5eb21053
   into the receipt-capable fork; preserve FB Story fixes, LinkedIn analytics,
   authenticated three-frame IDs/order and existing Temporal replay compatibility.
2. Pin changing production images to reviewed digests; derive image mirrors from
   one source, never silently promote newer development commits.
3. Precompile the main Temporal workflow bundle at build time if the installed
   wrapper supports it; prove artifact identity and replay rather than suppress
   runtime guards. Preserve activity-only provider queues.
4. Bound terminal Job/Pod retention after safe diagnostic export; no running Pod,
   PVC, media, receipts or incident evidence deletion to make health green.
5. Read real app contracts through gateway and existing fallback, then restore
   encrypted backups into an isolated DB with no publishing worker or production
   credentials exposed. Check schemas/counts and receipts without logging rows.
6. Required local tests, independent review, immutable selective release, current
   role-specific health and installed docs parity precede completed WT cleanup.

No completion inferred from package installation, image build, HTTP liveness or
archive extraction alone. Existing pinned content/templates and schedules remain.
