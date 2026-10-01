-- Copy ⟨Name⟩'s link without revoking it (tripper.md §1/§4, owner decision D1,
-- 2026-10-01): the raw token, AES-256-GCM encrypted (server/src/lib/linkCrypto.js).
-- NULL for links minted before this column — those can't be copied again and
-- fall back to minting a new one behind the "Replace link?" confirm.
ALTER TABLE participant_links ADD COLUMN token_enc TEXT NULL;
