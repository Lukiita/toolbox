# Gateways in Java — external services behind a port

The rules of the TypeScript page hold ([../gateway.md](../gateway.md) § The rules):
- domain types cross the port, and the provider's types never do, on either channel;
- a refusal and a failure are different outcomes;
- retry, backoff and timeout live inside the adapter;
- the port lives in `domain/` only when a rule depends on the capability.

In Java both outcomes are thrown: a **refusal** as a `DomainException` the caller may route on, a **failure** as an `InfrastructureException`, but only after the retries give up.

## The port

```java
package com.example.subscription.domain;

import com.example.shared.domain.DomainException;
import com.example.shared.domain.Money;

/** The port: domain types in, domain types out. The provider's SDK and errors stay in the adapter. */
public interface PaymentGateway {
    /**
     * @throws DomainException {@code payment.declined} when the provider refuses the charge
     * @throws com.example.shared.infra.InfrastructureException {@code payment.provider-unavailable}
     *     when the provider cannot be reached after the adapter's retries
     */
    PaymentReceipt charge(Money amount, CustomerId customer);
}
```

`PaymentReceipt` is a record (`transactionId`, `chargedAt`), and `CustomerId` is the provider's id ([typed-ids.md](typed-ids.md)).

## The adapter

```java
package com.example.subscription.infra;

import com.example.shared.domain.DomainException;
import com.example.shared.domain.Money;
import com.example.shared.infra.InfrastructureException;
import com.example.subscription.domain.CustomerId;
import com.example.subscription.domain.PaymentGateway;
import com.example.subscription.domain.PaymentReceipt;
import java.time.Clock;
import java.time.Duration;
import org.springframework.core.retry.RetryPolicy;
import org.springframework.core.retry.RetryTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * Adapter for a payment provider's HTTP API. Translates in both directions: a refusal becomes a
 * DomainException the caller can route on; a failure, after the retries give up, becomes an
 * InfrastructureException with the provider's error as cause.
 */
class HttpPaymentGateway implements PaymentGateway {
    // Retry only what can pass on its own: 5xx and I/O (timeouts included). A decline never retries.
    private static final RetryPolicy TRANSIENT_FAILURES = RetryPolicy.builder()
            .includes(HttpServerErrorException.class, ResourceAccessException.class)
            .maxRetries(2)
            .delay(Duration.ofMillis(200))
            .multiplier(2)
            .build();

    private final RestClient provider;
    private final RetryTemplate retry = new RetryTemplate(TRANSIENT_FAILURES);
    private final Clock clock;

    HttpPaymentGateway(RestClient provider, Clock clock) {
        this.provider = provider;
        this.clock = clock;
    }

    @Override
    public PaymentReceipt charge(Money amount, CustomerId customer) {
        try {
            ChargeResponse response = retry.invoke(() -> post(new ChargeRequest(amount.cents(), amount.currency().name(), customer.value())));
            return new PaymentReceipt(response.id(), clock.instant());
        } catch (HttpServerErrorException | ResourceAccessException failure) {
            throw new InfrastructureException("payment.provider-unavailable",
                    "charge for customer " + customer.value() + " failed after retries", failure);
        }
    }

    private ChargeResponse post(ChargeRequest request) {
        return provider.post()
                .uri("/charges")
                .body(request)
                .retrieve()
                .onStatus(status -> status.isSameCodeAs(HttpStatus.PAYMENT_REQUIRED), (req, res) -> {
                    throw new DomainException("payment.declined", "provider declined the charge for customer " + request.customer());
                })
                .body(ChargeResponse.class);
    }

    // The provider's wire format: it lives and dies inside this adapter.
    record ChargeRequest(long amount, String currency, String customer) {}

    record ChargeResponse(String id) {}
}
```

- **Retry with Spring Framework 7's core `RetryTemplate`**, no extra dependency. The policy names the transient failures it retries (5xx and I/O, timeouts included), so a decline never retries. `invoke` rethrows the last failure once the retries are spent, and the one `catch` translates it: one place, and testable without a Spring context. (Spring 7 also offers `@Retryable` with `@EnableResilientMethods`; the template keeps the retry and the translation in the same method.)
- **`Money` already is integer minor units**, the unit payment APIs expect, so nothing is converted on the way out.
- **No circuit breaker in Spring itself.** When a provider's outages last long enough that retries pile up, add Resilience4j around the call. It is a dependency, so the project decides.

## The timeout and the wiring

Every external call gets a timeout: without one, a slow provider holds a request thread for as long as it likes.

```java
package com.example.subscription.infra;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
class PaymentProviderConfiguration {
    @Bean
    HttpPaymentGateway paymentGateway(RestClient.Builder builder, Clock clock,
            @Value("${payment.provider.base-url}") String baseUrl) {
        // Every external call gets a timeout: without one a slow provider holds a thread forever.
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        JdkClientHttpRequestFactory requests = new JdkClientHttpRequestFactory(http);
        requests.setReadTimeout(Duration.ofSeconds(5));
        return new HttpPaymentGateway(builder.baseUrl(baseUrl).requestFactory(requests).build(), clock);
    }
}
```

Commands receive the gateway by its port type, through the constructor, like a repository.

## Testing the adapter

`MockRestServiceServer` plays the provider, bound to the same `RestClient.Builder`; no network, no Spring context:

```java
@BeforeEach
void setUp() {
    RestClient.Builder builder = RestClient.builder().baseUrl("http://provider");
    provider = MockRestServiceServer.bindTo(builder).build();
    gateway = new HttpPaymentGateway(builder.build(), Clock.fixed(NOW, ZoneOffset.UTC));
}

@Test
void anOutageRetriesThenThrowsInfrastructure() {
    provider.expect(ExpectedCount.times(3), requestTo("http://provider/charges")).andRespond(withServerError());
    assertThatThrownBy(() -> gateway.charge(PRICE, CUSTOMER))
            .isInstanceOf(InfrastructureException.class)
            .hasFieldOrPropertyWithValue("code", "payment.provider-unavailable");
    provider.verify();
}
```

The decline case expects `ExpectedCount.once()` and a `DomainException` with code `payment.declined`, which proves a refusal never retries.
