#!/usr/bin/env python3
"""
Selectively purge stale catalog-enrichment messages from an SQS DLQ.

The cron-jobs DLQ fills with SYNC_ARTIST_DISCOGRAPHY / SYNC_ALBUM_TRACKS / ENRICH_*
messages that dead-letter because Spotify is rate-limited / in Dev Mode. Redriving
them is pointless until Spotify is healthy, so this deletes ONLY those enrichment
types and PRESERVES everything else (TASTE_IDENTITY_REFRESH, REFRESH_STATS, ...)
so the real cron jobs can still be redriven later.

Usage:
    python3 scripts/purge-dlq-enrichment.py                  # DRY RUN: sample + estimate, delete nothing
    DRY_RUN=0 python3 scripts/purge-dlq-enrichment.py        # actually delete the enrichment types
    QUEUE=tracklist-enrich-jobs-dlq DRY_RUN=0 python3 ...     # target a different DLQ
    PURGE_TYPES="SYNC_ALBUM_TRACKS" DRY_RUN=0 python3 ...     # override which types to delete

No boto3 required (shells out to the `aws` CLI). Region defaults to us-east-2.
Stale AWS_* shell vars are cleared so ~/.aws creds win.
"""
import json
import os
import subprocess
import sys

REGION = os.environ.get("AWS_REGION_OVERRIDE", "us-east-2")
QUEUE = os.environ.get("QUEUE", "tracklist-cron-jobs-dlq")
DRY_RUN = os.environ.get("DRY_RUN", "1") != "0"
PURGE_TYPES = set(os.environ.get(
    "PURGE_TYPES",
    "SYNC_ARTIST_DISCOGRAPHY SYNC_ALBUM_TRACKS ENRICH_ALBUM ENRICH_ARTIST",
).split())
DRY_SAMPLE = int(os.environ.get("DRY_SAMPLE", "800"))   # max unique msgs to sample in dry run
IDLE_POLLS = int(os.environ.get("IDLE_POLLS_BEFORE_STOP", "8"))
KEEP_HIDE = os.environ.get("KEEP_HIDE_SECONDS", "600")  # hide preserved msgs so we stop re-reading

# Clear stale shell creds so ~/.aws (or explicitly-passed) creds are used.
_ENV = {k: v for k, v in os.environ.items()
        if k not in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN")}
_ENV["AWS_REGION"] = REGION
_ENV["AWS_DEFAULT_REGION"] = REGION


def aws(*args, capture=True):
    r = subprocess.run(["aws", *args], env=_ENV, capture_output=capture, text=True)
    if r.returncode != 0 and capture:
        return None
    return r.stdout if capture else None


def main():
    acct = (aws("sts", "get-caller-identity", "--query", "Account", "--output", "text") or "").strip()
    if not acct:
        sys.exit("ERROR: could not authenticate to AWS (check ~/.aws credentials)")
    arn = (aws("sts", "get-caller-identity", "--query", "Arn", "--output", "text") or "").strip()
    qurl = f"https://sqs.{REGION}.amazonaws.com/{acct}/{QUEUE}"

    depth_raw = aws("sqs", "get-queue-attributes", "--queue-url", qurl,
                    "--attribute-names", "ApproximateNumberOfMessages",
                    "--query", "Attributes.ApproximateNumberOfMessages", "--output", "text") or "0"
    depth = int(depth_raw.strip() or "0")

    print(f"Queue:       {QUEUE} ({REGION}) — ~{depth} messages")
    print(f"Purge types: {' '.join(sorted(PURGE_TYPES))}")
    print(f"Mode:        {'DELETE (live)' if not DRY_RUN else f'DRY RUN (sample up to {DRY_SAMPLE})'}")
    print(f"Identity:    {arn}")
    print("-" * 44)

    seen = set()
    deleted, kept = {}, {}
    total_del = total_kept = idle = 0
    # In dry run we don't hide messages (visibility 0) so a small queue is fully
    # walked; we cap by DRY_SAMPLE. Live run hides/deletes so it converges.
    vis = "0" if DRY_RUN else "60"

    while idle < IDLE_POLLS:
        out = aws("sqs", "receive-message", "--queue-url", qurl,
                  "--max-number-of-messages", "10", "--visibility-timeout", vis,
                  "--wait-time-seconds", "2", "--output", "json")
        msgs = (json.loads(out).get("Messages", []) if out and out.strip() else [])
        if not msgs:
            idle += 1
            continue

        del_handles, new = [], 0
        for m in msgs:
            mid = m.get("MessageId", "")
            if not mid or mid in seen:
                continue
            seen.add(mid)
            new += 1
            try:
                t = json.loads(m.get("Body", "{}")).get("type", "UNKNOWN")
            except Exception:
                t = "UNPARSEABLE"
            if t in PURGE_TYPES:
                deleted[t] = deleted.get(t, 0) + 1
                total_del += 1
                if not DRY_RUN:
                    del_handles.append(m["ReceiptHandle"])
            else:
                kept[t] = kept.get(t, 0) + 1
                total_kept += 1
                if not DRY_RUN:
                    aws("sqs", "change-message-visibility", "--queue-url", qurl,
                        "--receipt-handle", m["ReceiptHandle"], "--visibility-timeout", KEEP_HIDE)

        if del_handles:
            entries = json.dumps([{"Id": str(i), "ReceiptHandle": h} for i, h in enumerate(del_handles)])
            aws("sqs", "delete-message-batch", "--queue-url", qurl, "--entries", entries)

        idle = 0 if new else idle + 1
        print(f"\r  scanned {len(seen)} unique — {total_del} deletable, {total_kept} preserved   ", end="", flush=True)

        if DRY_RUN and len(seen) >= DRY_SAMPLE:
            break

    print("\n" + "-" * 44)
    label = "WOULD DELETE" if DRY_RUN else "DELETED"
    print(f"{label} by type:")
    for t, n in sorted(deleted.items(), key=lambda x: -x[1]):
        print(f"  {t:<26} {n}")
    if not deleted:
        print("  (none)")
    print("PRESERVED by type:")
    for t, n in sorted(kept.items(), key=lambda x: -x[1]):
        print(f"  {t:<26} {n}")
    if not kept:
        print("  (none)")
    print("-" * 44)

    if DRY_RUN and total_del + total_kept > 0:
        frac = total_del / (total_del + total_kept)
        print(f"Sampled {len(seen)} of ~{depth}. Deletable share: {frac*100:.1f}% "
              f"→ est. ~{int(frac*depth)} deletable, ~{depth-int(frac*depth)} preserved.")
        print("Re-run with DRY_RUN=0 to delete.")
    else:
        nd = aws("sqs", "get-queue-attributes", "--queue-url", qurl,
                 "--attribute-names", "ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible",
                 "--query", "Attributes", "--output", "json")
        print(f"Queue now: {nd.strip() if nd else '?'}")


if __name__ == "__main__":
    main()
