# Dunning on failed charge - verification

**Verdict**: FAIL
**Proofs**: `proofs.md` at e4f5a6b
**Verifier**: independent sub-agent (author != verifier)

## Checks

| Check | Test | Holds |
| --- | --- | --- |
| C1 | `test/billing/dunning_test.rb` `test_failed_charge_suspends` | yes |
| C2 | `test/billing/status_map_test.rb` `test_every_provider_status_maps_once` | yes |
| C3 | `test/billing/status_map_test.rb` `test_unknown_status_is_recorded` | yes |
| C4 | `test/billing/access_test.rb` `test_suspended_denies_paid_groups` | no - asserts the status changed, not the value |
| C5 | `test/billing/transitions_test.rb` `test_suspended_to_trialing_is_rejected` | yes |
| C6 | `test/billing/transitions_test.rb` `test_suspended_to_active` | yes |
| C7 | `test/webhooks/ingest_test.rb` `test_concurrent_delivery_conflicts` | yes |
| C8 | `test/webhooks/ingest_test.rb` `test_retry_is_idempotent` | yes |
| C9 | `test/webhooks/ingest_test.rb` `test_missing_subscription_id_is_422` | yes |
| C10 | `test/webhooks/dispatch_test.rb` `test_dispatches_every_event_type` | yes |
| C11 | `test/billing/dunning_test.rb` `test_provider_timeout_is_inert` | yes |
| C12 | `test/webhooks/ingest_test.rb` `test_unsigned_delivery_is_401` | yes |

## Mutants

| Rule | Mutant | Status | Killed by |
| --- | --- | --- | --- |
| failed charge suspends | `app/billing/dunning.rb:22` `:suspended` -> `:cancelled` | killed | `test/billing/dunning_test.rb` `test_failed_charge_suspends` |
| suspended blocks trialing | `app/billing/transitions.rb:14` guard removed | killed | `test/billing/transitions_test.rb` `test_suspended_to_trialing_is_rejected` |
| unknown status recorded | `app/billing/status_map.rb:31` `record_unknown` removed | killed | `test/billing/status_map_test.rb` `test_unknown_status_is_recorded` |

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| C4 asserts the status changed, not the value | `test/billing/access_test.rb:40` | assert `suspended` | e4f5a6b C4 |
