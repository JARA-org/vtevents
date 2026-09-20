/** Compile-time checks only. Never imported by the server or frontend. */
import type {
  CampusEvent,
  Profile,
  Fit,
  Recommendation,
  HttpApi,
  DiscoveryView,
  AvailabilityInput,
} from "../../../packages/shared/src/contracts.js";
import type * as domain from "./domain.js";
import type * as coordinator from "./coordinator.js";
import type * as sources from "./sources.js";
import type * as assistant from "./assistant.js";
import type * as discovery from "./discovery.js";
type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;
type Output<K extends keyof HttpApi> = HttpApi[K]["output"];
type Checks = [
  Assert<Extends<ReturnType<typeof domain.eventSchema.parse>, CampusEvent>>,
  Assert<Extends<ReturnType<typeof domain.profileSchema.parse>, Profile>>,
  Assert<Extends<ReturnType<typeof domain.scheduleFit>, Fit>>,
  Assert<Extends<ReturnType<typeof domain.recommendations>, Recommendation[]>>,
  Assert<Extends<ReturnType<typeof coordinator.liveEvents>, CampusEvent[]>>,
  Assert<
    Extends<ReturnType<typeof coordinator.reconcileEvents>, CampusEvent[]>
  >,
  Assert<
    Extends<Awaited<ReturnType<typeof sources.fetchGobbler>>, CampusEvent[]>
  >,
  Assert<
    Extends<Awaited<ReturnType<typeof sources.fetchSports>>, CampusEvent[]>
  >,
  Assert<
    Extends<
      Awaited<ReturnType<typeof assistant.askGobbler>>,
      Output<"askAssistant">
    >
  >,
  Assert<Extends<ReturnType<typeof discovery.discoverEvents>, DiscoveryView>>,
  Assert<
    Extends<
      Parameters<typeof discovery.previewAvailability>[0],
      AvailabilityInput
    >
  >,
];
