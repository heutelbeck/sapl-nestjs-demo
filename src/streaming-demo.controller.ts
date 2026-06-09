import { Controller, Sse } from '@nestjs/common';
import { Observable, catchError, of, throwError } from 'rxjs';
import { TransitionSignals, AccessDeniedError } from '@sapl/nestjs';
import { StreamingDemoService } from './streaming-demo.service';

const SUSPEND_FRAME = {
  data: JSON.stringify({ type: 'ACCESS_SUSPENDED', message: 'Stream paused by policy' }),
};

const GRANTED_FRAME = {
  data: JSON.stringify({ type: 'ACCESS_GRANTED', message: 'Access granted by policy' }),
};

const DENIED_FRAME = {
  data: JSON.stringify({ type: 'ACCESS_DENIED', message: 'Stream terminated by policy' }),
};

/**
 * SSE endpoints for streaming authorization against the unified `@StreamEnforce`
 * decorator from `@sapl/nestjs`. The three controller endpoints express the three
 * streaming semantics of the 4.1 model: terminate on DENY, suspend silently, and
 * suspend with observable boundary frames. The same observable-suspend rendering
 * is exposed under `api/services/streaming` to show enforcement on a domain service.
 */
@Controller()
export class StreamingDemoController {
  constructor(private readonly streamingService: StreamingDemoService) {}

  /**
   * Stream until a DENY decision arrives, then terminate.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/till-denied
   */
  @Sse('api/streaming/heartbeat/till-denied')
  heartbeatTillDenied(): Observable<unknown> {
    return this.streamingService.heartbeatTillDenied().pipe(
      catchError((error) =>
        error instanceof AccessDeniedError ? of(DENIED_FRAME) : throwError(() => error),
      ),
    );
  }

  /**
   * Drop heartbeats silently while suspended; resume on PERMIT. No boundary frames.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/silent-suspending
   */
  @Sse('api/streaming/heartbeat/silent-suspending')
  heartbeatSilentSuspending(): Observable<unknown> {
    return this.streamingService.heartbeatSilentSuspending();
  }

  /**
   * Suspend semantics with explicit ACCESS_SUSPENDED / ACCESS_GRANTED frames sent
   * to the client on every boundary crossing, so subscribers react to pauses without
   * losing the connection.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/observed-suspending
   */
  @Sse('api/streaming/heartbeat/observed-suspending')
  heartbeatObservedSuspending(): Observable<unknown> {
    return this.observedSuspending();
  }

  /**
   * Service-layer streaming: enforcement is on StreamingDemoService.heartbeatObservedSuspending().
   * Connect with: curl -N http://localhost:3000/api/services/streaming/heartbeat/observed-suspending
   */
  @Sse('api/services/streaming/heartbeat/observed-suspending')
  serviceHeartbeatObservedSuspending(): Observable<unknown> {
    return this.observedSuspending();
  }

  private observedSuspending(): Observable<unknown> {
    const raw = this.streamingService.heartbeatObservedSuspending();
    const withSuspend = TransitionSignals.onSuspend(raw, () => undefined, () => SUSPEND_FRAME);
    return TransitionSignals.onGranted(withSuspend, () => undefined, () => GRANTED_FRAME);
  }
}
