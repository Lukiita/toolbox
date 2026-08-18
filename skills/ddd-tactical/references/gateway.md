# Gateways — external services behind a port

A gateway is the repository pattern pointed outward: where the repository crosses the *persistence* boundary, the gateway crosses the boundary to an **external service** (payment provider, mail, a government API). Same inversion, same two halves:

- **The port** — an interface in `domain/` (when a rule depends on it) speaking domain language and domain types.
- **The adapter** — in `infra/gateways/`, where the third-party SDK lives.

```ts
// <feature>/domain/payment.gateway.ts  (the port)
import type { Money } from '@/src/shared/domain/money.vo';
import type { Result } from '@/src/shared/domain/result';
import type { DomainError } from '@/src/shared/domain/domain-error';

export interface PaymentGateway {
  charge(amount: Money, customerId: string): Promise<Result<PaymentReceipt, DomainError>>;
}

export interface PaymentReceipt {
  transactionId: string;
  chargedAt: Date;
}
```

```ts
// <feature>/infra/gateways/stripe-payment.gateway.ts  (the adapter)
import Stripe from 'stripe';

import { DomainError } from '@/src/shared/domain/domain-error';
import { Result } from '@/src/shared/domain/result';
import type { Money } from '@/src/shared/domain/money.vo';
import type { PaymentGateway, PaymentReceipt } from '../../domain/payment.gateway';

export class StripePaymentGateway implements PaymentGateway {
  public constructor(private readonly stripe: Stripe) {}

  public async charge(amount: Money, customerId: string): Promise<Result<PaymentReceipt, DomainError>> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        // Money already IS integer minor units - the house invariant matches
        // what payment APIs expect, no conversion dance here.
        amount: amount.amount,
        currency: amount.currency.toLowerCase(),
        customer: customerId,
        confirm: true,
      });
      return Result.ok({ transactionId: intent.id, chargedAt: new Date() });
    } catch (error) {
      // The adapter TRANSLATES the provider's failure into a domain error -
      // callers route on 'payment.declined', never on a Stripe error class.
      // Provider outages that should crash the flow may rethrow instead;
      // that is the infra-failure row of the domain-errors table.
      if (error instanceof Stripe.errors.StripeCardError) {
        return Result.fail(new DomainError('payment.declined', error.message));
      }
      throw error;
    }
  }
}
```

## The rules

- **Domain types cross the port; SDK types never do.** The port speaks `Money` and `PaymentReceipt`; `Stripe.PaymentIntent` dies inside the adapter. Swap Stripe for another provider and only `infra/gateways/` changes.
- **Expected refusals become `DomainError`s** (`payment.declined`) so commands route on them like any rule refusal; genuine infrastructure failures may rethrow — the split follows the [domain-errors.md](domain-errors.md) table exactly.
- **The port lives in `domain/` when a rule depends on the capability** ("charging happens before activation"). A purely operational integration nobody's rule mentions (an analytics ping) doesn't need a port at all — call it from the command or a subscriber and keep the ceremony for where it pays.
- Commands receive gateways the same way they receive repositories: injected through the constructor, by port type.
