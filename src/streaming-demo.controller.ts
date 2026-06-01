import { Controller, Sse } from '@nestjs/common';
import { Observable, catchError, of, throwError } from 'rxjs';
import { TransitionSignals, AccessDeniedError } from '@sapl/nestjs';
import { StreamingDemoService } from './streaming-demo.service';

const SUSPEND_FRAME = {
  data: JSON.stringify({ type: 'ACCESS_SUSPENDED', message: 'Stream paused by policy' }),
};

const GRANTED_FRAME = {
  data: JSON.stringify({ type: 'ACCESS_RESTORED', message: 'Stream resumed by policy' }),
};

const DENIED_FRAME = {
  data: JSON.stringify({ type: 'ACCESS_DENIED', message: 'Stream terminated by policy' }),
};

/**
 * SSE endpoints for streaming authorization against the unified `@StreamEnforce`
 * decorator from `@sapl/nestjs`. The three endpoints express the three streaming
 * semantics of the 4.1 model: terminate on DENY, suspend silently, and suspend
 * with observable boundary frames.
 */
@Controller('api/streaming')
export class StreamingDemoController {
  constructor(private readonly streamingService: StreamingDemoService) {}

  /**
   * Stream until a DENY decision arrives, then terminate.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/till-denied
   */
  @Sse('heartbeat/till-denied')
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
  @Sse('heartbeat/silent-suspending')
  heartbeatSilentSuspending(): Observable<unknown> {
    return this.streamingService.heartbeatSilentSuspending();
  }

  /**
   * Suspend semantics with explicit ACCESS_SUSPENDED / ACCESS_RESTORED frames sent
   * to the client on every boundary crossing, so subscribers react to pauses without
   * losing the connection.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/observed-suspending
   */
  @Sse('heartbeat/observed-suspending')
  heartbeatObservedSuspending(): Observable<unknown> {
    const raw = this.streamingService.heartbeatObservedSuspending();
    const withSuspend = TransitionSignals.onSuspend(raw, () => undefined, () => SUSPEND_FRAME);
    return TransitionSignals.onGranted(withSuspend, () => undefined, () => GRANTED_FRAME);
  }
}
