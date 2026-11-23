# Java — the stack, the line, the packages, the names

Read this page first in a Java project, then the Java page of the block you are writing (the Java column of the table in [SKILL.md](../../SKILL.md)). The pages target **Java 25 and Spring Boot 4.2** (Spring Framework 7.1, Spring Data JDBC 4.2, JUnit 6). Every sample on them compiled and passed its tests against PostgreSQL 18 under Testcontainers (2026-11-22).

## Where Java differs from the TypeScript pages, on purpose

The three questions, the invariant inside the aggregate and money in integer cents hold unchanged. Three mechanisms differ, each priced on its page:

- **Failures are thrown, as named exceptions.** A rule refusal is a `DomainException`, a blocked use case an `ApplicationException`, an outage an `InfrastructureException`, and one `@RestControllerAdvice` maps them. Java code has no `Result`: [domain-errors.md](domain-errors.md) says why the two languages split here.
- **Spring Data JDBC maps the domain directly.** Aggregates carry Spring Data mapping labels (`@Id`, `@Table`, `@Version`) and the repository port is an interface Spring implements: no row type, no mapper, no adapter in the common case ([repository.md](repository.md)).
- **Every id and every value object is a record.** Java compares records by value, so the TypeScript brand has no Java counterpart ([typed-ids.md](typed-ids.md)).

## The line: what the domain may import

The domain may carry **persistence mapping labels**; it never reaches **HTTP, transactions or I/O**. An annotation is inert metadata: a unit test of an annotated aggregate runs with no Spring at all. What costs is a framework that changes the shape or the behavior of domain classes, and Spring Data JDBC changes neither: it builds an aggregate through the aggregate's own factory, accepts records and `final` fields, loads nothing lazily and writes only on `save`.

| The domain may import | The domain never imports |
|---|---|
| `java.*` — `java.time` and `java.math` are the computation libraries the TypeScript side takes from npm | `org.springframework.web..`, `..http..`, `..transaction..`, `..jdbc..` |
| its own feature, `shared.domain`, and another feature's **root package** (that feature's public API) | `jakarta.persistence..` (JPA: see [repository.md](repository.md)), `jakarta.servlet..` |
| Spring Data labels: `org.springframework.data.annotation`, `..data.relational.core.mapping`, `..data.domain` (events), `..data.repository` (the port's marker) | stereotypes and injection (`@Component`, `@Service`, `@Autowired`): a domain service is a plain class the handler builds or receives |

The rule is an allow-list, so a new library fails the build until someone decides it belongs (archunit-junit5 1.5.1):

```java
package com.example;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packages = "com.example", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {
    // An allow-list: anything not named here - web, transactions, JDBC, a new library - fails the build.
    @ArchTest
    static final ArchRule domainCarriesOnlyPersistenceLabels = classes()
            .that().resideInAPackage("..domain..")
            .should().onlyDependOnClassesThat().resideInAnyPackage(
                    "java..",
                    "com.example.*",
                    "..domain..",
                    "org.springframework.data.annotation..",
                    "org.springframework.data.relational.core.mapping..",
                    "org.springframework.data.domain..",
                    "org.springframework.data.repository..");
}
```

`com.example.*` is one level deep: the feature root packages, where each feature publishes its ids.

## Packages (package by feature)

```
src/main/java/com/example/
├── <feature>/                      the feature's PUBLIC API: what other features may hold (SubscriptionId, published events)
│   ├── domain/                     aggregate, value objects, repository port, gateway ports, events
│   ├── application/
│   │   ├── commands/               RenewSubscriptionCommand + RenewSubscriptionHandler (write side)
│   │   └── queries/                ListActiveSubscriptionsQuery + its read-model record (read side, JdbcClient)
│   ├── infra/                      gateway adapters, the feature's typed-id conversions (@Configuration)
│   └── presentation/               controller, request records, the feature's error statuses
└── shared/                         the kernel, layered like a feature
    ├── domain/                     TypedId, Entity, AggregateRoot, DomainEvent, DomainException, Money
    ├── application/                ApplicationException
    ├── infra/                      InfrastructureException, TypedIdConversion, the Clock bean
    └── presentation/               ThrownErrorAdvice, DomainErrorStatuses
```

- **The feature root package is the feature's public API**, the Java counterpart of a TypeScript `index.ts`: Java cannot re-export, so what other features may use lives there physically. Sub-packages are the feature's own.
- **One build module.** The layers are packages, and the ArchUnit rule holds the import direction.

## Class names

Java makes the file name the public class name, so the TypeScript suffix rule does not carry over: a suffix on a domain noun would land in every signature (`SubscriptionAggregate`, `MoneyVo`) and push the domain's own word out of the code. **Domain nouns carry no suffix; roles do.** The kind of a domain type is visible from its package.

| block | TypeScript file | Java type |
|---|---|---|
| value object | `money.vo.ts` | `Money` (record) |
| aggregate root / inner entity | `subscription.aggregate.ts` / `plan.entity.ts` | `Subscription` / `LineItem` (classes) |
| typed id | declared in the aggregate's file | `SubscriptionId` (record, its own file, feature root) |
| repository port | `subscription.repository.ts` | `SubscriptionRepository` (interface Spring implements) |
| repository adapter + mapper | `supabase-subscription.repository.ts` + `subscription.mapper.ts` | none in the common case ([repository.md](repository.md)) |
| command | `renew-subscription.command.ts` | `RenewSubscriptionCommand` (record) + `RenewSubscriptionHandler` |
| query + read model | `list-active-subscriptions.query.ts` | `ListActiveSubscriptionsQuery`, read model nested as a record |
| request contract | `renew-subscription.request.ts` | `CreateSubscriptionRequest` (record, Bean Validation) |
| controller | `subscription.controller.ts` | `SubscriptionController` |
| gateway port / adapter | `payment.gateway.ts` / `stripe-payment.gateway.ts` | `PaymentGateway` / `StripePaymentGateway` |
| domain event | `subscription-renewed.event.ts` | `SubscriptionRenewed` (record, past tense) |
| error mapping | `use-case-error.mapper.ts` / `thrown-error.filter.ts` | `SubscriptionErrorStatuses` (per feature) / `ThrownErrorAdvice` (shared) |
| kernel base types | `value-object.ts`, `aggregate-root.ts` | `TypedId`, `Entity`, `AggregateRoot` |
| test | `money.vo.test.ts` | `MoneyTest`, `SubscriptionPersistenceTest` |

## Tests

- **Domain tests are plain JUnit and AssertJ**: build, call, assert, no Spring context. Assert on the code a refusal carries — the spec's value, never one recomputed the way the code computes it:
  ```java
  assertThatThrownBy(() -> subscription.renew(NOW))
          .isInstanceOf(DomainException.class)
          .hasFieldOrPropertyWithValue("code", "subscription.canceled");
  ```
- **Persistence and HTTP tests boot the app against a real PostgreSQL**, so mapping errors surface where they happen (most appear only when a row is read or written):
  ```java
  @TestConfiguration(proxyBeanMethods = false)
  public class TestDatabase {
      @Bean
      @ServiceConnection
      PostgreSQLContainer postgres() {   // org.testcontainers.postgresql.PostgreSQLContainer (Testcontainers 2)
          return new PostgreSQLContainer("postgres:18-alpine");
      }
  }
  ```
  A test class adds `@SpringBootTest @Import(TestDatabase.class)`; HTTP tests drive the app with `MockMvcTester.from(webApplicationContext)`.
- **Mock only at the system boundary**: `MockRestServiceServer` for a provider's HTTP API, `Clock.fixed(...)` for time ([gateway.md](gateway.md)).

## Build and runtime notes

- **`-parameters`.** Spring Data matches the parameters of `restore` to fields by name. The Spring Boot Maven and Gradle plugins compile with `-parameters`; a hand-made build must add it.
- **Time** is one `Clock` bean (`Clock.systemUTC()` in `shared/infra`); handlers pass `clock.instant()` into the domain.
- **Logs** are structured JSON through the Boot property `logging.structured.format.console=logstash`, written with SLF4J key-values (`LOG.atError().addKeyValue("code", error.code()).setCause(error).log(...)`).
- **Two PMD rules hold the two Java traps of this house** (checked with PMD 7.17): `CompareObjectsWithEquals` — `==` on a record or an aggregate compares references, never values; `AvoidCatchingGenericException` — a `catch (RuntimeException e)` swallows a refusal and a bug together.
