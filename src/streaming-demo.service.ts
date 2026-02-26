import { Injectable, Logger } from '@nestjs/common';
import { Observable, interval, map } from 'rxjs';
import {
  EnforceTillDenied,
  EnforceDropWhileDenied,
  EnforceRecoverableIfDenied,
} from '@sapl/nestjs';

/**
 * Streaming authorization demos using the three SAPL enforcement strategies.
 *
 * All three methods emit a heartbeat every 2 seconds. The PDP policy
 * permit-stream-heartbeat cycles PERMIT/DENY based on the current second
 * (0-19 permit, 20-39 deny, 40-59 permit), so you can observe how each
 * strategy handles authorization changes in real time.
 */
@Injectable()
export class StreamingDemoService {
  private readonly logger = new Logger(StreamingDemoService.name);

  /**
   * @EnforceTillDenied -- stream terminates permanently on first DENY.
   *
   * The onStreamDeny callback sends a final ACCESS_DENIED event before
   * the stream completes. Once denied, the client must reconnect.
   */
  @EnforceTillDenied({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
    onStreamDeny: (_decision, subscriber) => {
      subscriber.next({
        data: JSON.stringify({
          type: 'ACCESS_DENIED',
          message: 'Stream terminated by policy',
        }),
      });
    },
  })
  heartbeatTillDenied(): Observable<any> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }

  /**
   * @EnforceDropWhileDenied -- silently drops events during DENY periods.
   *
   * The client sees gaps in sequence numbers but the stream stays open.
   * Events resume automatically when the PDP re-permits.
   */
  @EnforceDropWhileDenied({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
  })
  heartbeatDropWhileDenied(): Observable<any> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }

  /**
   * @EnforceRecoverableIfDenied -- sends explicit suspend/restore signals.
   *
   * On DENY: onStreamDeny sends an ACCESS_SUSPENDED event.
   * On re-PERMIT: onStreamRecover sends an ACCESS_RESTORED event.
   * The client can show UI status changes based on these signals.
   */
  @EnforceRecoverableIfDenied({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
    onStreamDeny: (_decision, subscriber) => {
      subscriber.next({
        data: JSON.stringify({
          type: 'ACCESS_SUSPENDED',
          message: 'Waiting for re-authorization',
        }),
      });
    },
    onStreamRecover: (_decision, subscriber) => {
      subscriber.next({
        data: JSON.stringify({
          type: 'ACCESS_RESTORED',
          message: 'Authorization restored',
        }),
      });
    },
  })
  heartbeatRecoverable(): Observable<any> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }

  /**
   * @EnforceRecoverableIfDenied with a deny callback.
   *
   * On DENY: onStreamDeny injects an ACCESS_SUSPENDED event into the stream.
   * The stream stays alive and resumes forwarding on re-PERMIT.
   */
  @EnforceRecoverableIfDenied({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
    onStreamDeny: (_decision, emitter) => {
      emitter.next({
        data: JSON.stringify({
          type: 'ACCESS_SUSPENDED',
          message: 'Stream suspended by policy',
        }),
      });
    },
  })
  heartbeatTerminatedByCallback(): Observable<any> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }

  /**
   * @EnforceDropWhileDenied silently drops data during DENY periods.
   *
   * No callbacks -- data is simply not forwarded while denied.
   * The stream stays alive and resumes forwarding on re-PERMIT.
   */
  @EnforceDropWhileDenied({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
  })
  heartbeatDropWithCallbacks(): Observable<any> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }
}
