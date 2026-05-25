import { Injectable, Logger } from '@nestjs/common';
import { Observable, interval, map } from 'rxjs';
import { StreamEnforce } from '@sapl/nestjs';

/**
 * Streaming authorization demos using the unified SAPL @StreamEnforce
 * decorator from 2.0.
 *
 * The cycling policy `streaming-heartbeat-time-based` emits:
 *   second in [0, 20)  -> PERMIT (with logAccess obligation).
 *   second in [20, 40) -> SUSPEND (paused; subscription stays alive).
 *   second in [40, 60) -> PERMIT (with logAccess obligation).
 *
 * Each method emits a heartbeat every 2 seconds while the FSM is in
 * the Permitting state. The two `@StreamEnforce` flags select between
 * the variants the legacy 1.x trio expressed via three separate
 * decorators:
 *   - default flags                        -> drop-while-suspended.
 *   - signalTransitions: true              -> surface boundaries on next.
 *   - pauseRapDuringSuspend: true          -> unsubscribe the protected
 *                                             method's Observable on entry
 *                                             into Suspended.
 */
@Injectable()
export class StreamingDemoService {
  private readonly logger = new Logger(StreamingDemoService.name);

  /**
   * Default behaviour: the protected method's Observable stays connected;
   * RAP emissions are silently dropped while the FSM is Suspended; any
   * DENY terminates the subscription with an AccessDeniedException on the
   * error channel.
   */
  @StreamEnforce({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
  })
  heartbeatDropWhileSuspended(): Observable<unknown> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }

  /**
   * signalTransitions surfaces suspend / resume boundaries on the
   * subscriber's `next` channel as AccessDeniedException /
   * AccessGrantedSignal instances. The controller unwraps them via
   * `TransitionSignals.onTransitions` and forwards them to the client.
   */
  @StreamEnforce({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
    signalTransitions: true,
  })
  heartbeatWithTransitions(): Observable<unknown> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }

  /**
   * pauseRapDuringSuspend disposes the protected method's Observable on
   * entry into Suspended and re-subscribes on resume into Permitting.
   * Useful when the upstream is expensive (database polling, external
   * APIs) and side effects must pause for the duration of the suspension.
   */
  @StreamEnforce({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
    pauseRapDuringSuspend: true,
    signalTransitions: true,
  })
  heartbeatPausingDuringSuspend(): Observable<unknown> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }
}
