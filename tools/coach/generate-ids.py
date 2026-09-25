#!/usr/bin/env python3
"""Generate random SpikeFit coach-module card IDs (ADR-014).

Standard library only — no pip install needed, matching SpikeFit's
zero-runtime-dependency policy.

IDs are `<prefix>-<6 chars>` using the Crockford base32 alphabet, which
excludes I, L, O, and U to avoid visual confusion when read off a printed
card. IDs are generated with `secrets` (cryptographically random), not a
counter — sequential IDs would let anyone guess a valid-looking ID and print
a card that passes as someone else. See coach-module-plan.md, "ID format",
and cloudflare/worker.js's COACH_ID_RE, which this alphabet must stay in
sync with.

Usage:
    python3 generate-ids.py --kind parent --count 10
    python3 generate-ids.py --kind kid --count 25 > kid-ids.txt
"""
import argparse
import secrets

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32, no I/L/O/U
ID_LENGTH = 6


def generate_id(prefix):
    suffix = ''.join(secrets.choice(ALPHABET) for _ in range(ID_LENGTH))
    return f"{prefix}-{suffix}"


def main():
    parser = argparse.ArgumentParser(description="Generate random SpikeFit coach card IDs.")
    parser.add_argument('--kind', choices=['parent', 'kid'], required=True,
                         help="parent -> P- prefix, kid -> K- prefix")
    parser.add_argument('--count', type=int, default=1, help="how many IDs to generate")
    args = parser.parse_args()

    if args.count < 1:
        parser.error("--count must be at least 1")

    prefix = 'P' if args.kind == 'parent' else 'K'

    # Collision odds are astronomically low at any realistic team size (32^6
    # possibilities per prefix), but re-roll on collision anyway rather than
    # ever silently hand out a duplicate card ID.
    ids = set()
    while len(ids) < args.count:
        ids.add(generate_id(prefix))

    for card_id in sorted(ids):
        print(card_id)


if __name__ == '__main__':
    main()
