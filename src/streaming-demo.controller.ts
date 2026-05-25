import { Controller, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TransitionSignals } from '@sapl/nestjs';
import { StreamingDemoService } from './streaming-demo.service';

const SUSPEND_FRAME = {
  data: JSON.stringify({ type: 'ACCESS_SUSPENDED', message: 'Stream paused by policy' }),
};

const GRANTED_FRAME = {
  data: JSON.stringify({ type: 'ACCESS_RESTORED', message: 'Stream resumed by policy' }),
};

/**
 * SSE endpoints for streaming authorization demos against the unified
 * `@StreamEnforce` decorator from `@sapl/nestjs` 2.0.
 *
 * The cycling policy `streaming-heartbeat-time-based` emits PERMIT in
 * [0, 20) and [40, 60) and SUSPEND in [20, 40). The three endpoints
 * below illustrate how the two `@StreamEnforce` flags combine to express
 * the three semantics the legacy 1.x trio expressed via three separate
 * decorators.
 */
@Controller('api/streaming')
export class StreamingDemoController {
  constructor(private readonly streamingService: StreamingDemoService) {}

  /**
   * Stream until a DENY decision arrives, then terminate. With the cycling
   * SUSPEND policy this drops items during the pause window; a real DENY
   * would close the stream.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/till-denied
   */
  @Sse('heartbeat/till-denied')
  heartbeatTillDenied(): Observable<unknown> {
    return this.streamingService.heartbeatDropWhileSuspended();
  }

  /**
   * Drop heartbeats silently while denied/suspended; resume on PERMIT.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/drop-while-denied
   */
  @Sse('heartbeat/drop-while-denied')
  heartbeatDropWhileDenied(): Observable<unknown> {
    return this.streamingService.heartbeatPausingDuringSuspend();
  }

  /**
   * Drop semantics with explicit ACCESS_SUSPENDED / ACCESS_RESTORED frames
   * sent to the client on every boundary crossing, so subscribers can react
   * to pauses without losing the connection.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/recoverable
   */
  @Sse('heartbeat/recoverable')
  heartbeatRecoverable(): Observable<unknown> {
    const raw = this.streamingService.heartbeatWithTransitions();
    const withSuspend = TransitionSignals.onSuspend(raw, () => undefined, () => SUSPEND_FRAME);
    return TransitionSignals.onGranted(withSuspend, () => undefined, () => GRANTED_FRAME);
  }
}
