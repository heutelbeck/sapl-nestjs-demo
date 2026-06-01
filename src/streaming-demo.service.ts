import { Injectable } from '@nestjs/common';
import { Observable, interval, map } from 'rxjs';
import { StreamEnforce } from '@sapl/nestjs';

/**
 * Streaming authorization demos on the unified SAPL @StreamEnforce decorator.
 *
 * The cycling policy `streaming-heartbeat-time-based` PERMITs in [0, 20) and
 * [40, 60). In [20, 40) it DENYs the `stream:terminate` action and SUSPENDs the
 * `stream:suspend` action. The three endpoints differ only by action and the
 * `signalTransitions` flag:
 *   - till-denied         -> action stream:terminate; DENY terminates the stream.
 *   - silent-suspending   -> action stream:suspend; SUSPEND drops items silently.
 *   - observed-suspending -> action stream:suspend + signalTransitions; boundaries surface.
 */
@Injectable()
export class StreamingDemoService {
  @StreamEnforce({
    action: 'stream:terminate',
    resource: 'heartbeat',
  })
  heartbeatTillDenied(): Observable<unknown> {
    return this.heartbeatSource();
  }

  @StreamEnforce({
    action: 'stream:suspend',
    resource: 'heartbeat',
  })
  heartbeatSilentSuspending(): Observable<unknown> {
    return this.heartbeatSource();
  }

  @StreamEnforce({
    action: 'stream:suspend',
    resource: 'heartbeat',
    signalTransitions: true,
  })
  heartbeatObservedSuspending(): Observable<unknown> {
    return this.heartbeatSource();
  }

  private heartbeatSource(): Observable<unknown> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }
}
