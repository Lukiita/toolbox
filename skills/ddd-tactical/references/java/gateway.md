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
     *     when the provider fails, rate-limits or rejects the request, after the adapter's retries
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
import java.util.UUID;
import org.springframework.core.retry.RetryPolicy;
import org.springframework.core.retry.RetryTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Adapter for a payment provider's HTTP API. Translates in both directions: a refusal becomes a
 * DomainException the caller can route on; any failure, after the retries give up, becomes an
 * InfrastructureException with the provider's error as cause - no provider type leaves this class.
 *
 * <p>Circuit breaker: none for this provider (decided per provider - see gateway.md). Fallback:
 * none - a charge that did not happen must never look like one that did.
 */
class HttpPaymentGateway implements PaymentGateway {
    private final RestClient provider;
    private final RetryTemplate retry;
    private final Clock clock;

    HttpPaymentGateway(RestClient provider, RetryTemplate retry, Clock clock) {
        this.provider = provider;
        this.retry = retry;
        this.clock = clock;
    }

    /** Retries only what can pass on its own: 5xx, 429 and I/O (timeouts included). A decline never retries. */
    static RetryTemplate retryOnTransientFailures(int maxRetries, Duration delay) {
        return new RetryTemplate(RetryPolicy.builder()
                .includes(HttpServerErrorException.class, HttpClientErrorException.TooManyRequests.class,
                        ResourceAccessException.class)
                .maxRetries(maxRetries)
                .delay(delay)
                .multiplier(2)
                .build());
    }

    @Override
    public PaymentReceipt charge(Money amount, CustomerId customer) {
        // One key for every attempt: a timeout can hide a charge the provider already took, and
        // the key makes the provider apply a retried charge once, never twice.
        String idempotencyKey = UUID.randomUUID().toString();
        ChargeRequest request = new ChargeRequest(amount.cents(), amount.currency().name(), customer.value());
        try {
            ChargeResponse response = retry.invoke(() -> post(request, idempotencyKey));
            return new PaymentReceipt(response.id(), clock.instant());
        } catch (RestClientException failure) {
            throw new InfrastructureException("payment.provider-unavailable",
                    "charge for customer " + customer.value() + " failed", failure);
        }
    }

    private ChargeResponse post(ChargeRequest request, String idempotencyKey) {
        return provider.post()
                .uri("/charges")
                .header("Idempotency-Key", idempotencyKey)
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

- **One idempotency key per charge, sent on every attempt.** A timeout or a 5xx can hide a charge the provider already took, and a blind retry would charge twice; the key makes the provider apply a retried charge once. The key born in the adapter covers the adapter's own retries. A retry of the whole command (a client resubmitting) needs a key tied to the business operation, such as the subscription and the period being paid, passed through the port.
- **Retry only what can pass on its own** (5xx, 429, I/O with timeouts), with Spring Framework 7's core `RetryTemplate`: no extra dependency. `invoke` rethrows the last failure once the retries are spent. (Spring 7 also offers `@Retryable` with `@EnableResilientMethods`; the template keeps the retry and the translation in one method, testable without a Spring context.)
- **Every provider failure is translated.** One `catch (RestClientException …)` covers 5xx, 429, any other 4xx, I/O and an unreadable answer, so no provider type crosses the port and the advice answers 503. Only a 402 is a refusal (`payment.declined`), and it is never retried. Verified: three attempts on 5xx and on 429, one on 400 and on 402, and the same key on every attempt.
- **Circuit breaker and fallback are decided per provider, explicitly**, and written in the adapter's Javadoc. Spring has no circuit breaker; Resilience4j wraps the same call when a provider's outages last long enough that retries pile up (a dependency, so the project decides). A payment has no fallback: a charge that did not happen must never look like one that did.
- **`Money` already is integer minor units**, the unit payment APIs expect, so nothing is converted on the way out.

## One place for the provider's limits

Every external call gets a timeout, and every limit of one provider lives in one properties record: the URL, both timeouts, the retries. The record also bounds the worst case of one charge. Know that bound: a gateway called inside a `@Transactional` handler holds a pooled database connection for all of it. Keep it below what the pool tolerates, and when the provider is slow, split the flow so the charge runs outside the transaction.

```java
package com.example.subscription.infra;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Every limit of the payment provider in one place, bound from {@code payment.provider.*}.
 * The worst case of one charge is (connectTimeout + readTimeout) x (maxRetries + 1) plus the
 * backoff - keep it below what the caller's transaction and connection pool tolerate.
 */
@ConfigurationProperties("payment.provider")
record PaymentProviderProperties(URI baseUrl, Duration connectTimeout, Duration readTimeout, int maxRetries,
        Duration retryDelay) {}
```

```properties
payment.provider.base-url=https://provider.example
payment.provider.connect-timeout=2s
payment.provider.read-timeout=5s
payment.provider.max-retries=2
payment.provider.retry-delay=200ms
```

```java
package com.example.subscription.infra;

import java.net.http.HttpClient;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PaymentProviderProperties.class)
class PaymentProviderConfiguration {
    @Bean
    HttpPaymentGateway paymentGateway(RestClient.Builder builder, PaymentProviderProperties provider, Clock clock) {
        return new HttpPaymentGateway(restClient(builder, provider),
                HttpPaymentGateway.retryOnTransientFailures(provider.maxRetries(), provider.retryDelay()), clock);
    }

    // Every external call gets a timeout: without one a slow provider holds a thread forever.
    private static RestClient restClient(RestClient.Builder builder, PaymentProviderProperties provider) {
        HttpClient http = HttpClient.newBuilder().connectTimeout(provider.connectTimeout()).build();
        JdkClientHttpRequestFactory requests = new JdkClientHttpRequestFactory(http);
        requests.setReadTimeout(provider.readTimeout());
        return builder.baseUrl(provider.baseUrl().toString()).requestFactory(requests).build();
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
    gateway = new HttpPaymentGateway(builder.build(), HttpPaymentGateway.retryOnTransientFailures(2, Duration.ofMillis(10)),
            Clock.fixed(NOW, ZoneOffset.UTC));
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

The other cases: a decline expects `ExpectedCount.once()` and a `DomainException` with code `payment.declined`; a 429 expects three attempts; a 400 expects one attempt and an `InfrastructureException`. A matcher that collects the `Idempotency-Key` header of each request proves every attempt sends the same key.
