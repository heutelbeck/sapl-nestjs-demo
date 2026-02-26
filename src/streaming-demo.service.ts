import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
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
        data: JSON.stringify({ type: 'ACCESS_DENIED', message: 'Stream terminated by policy' }),
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
        data: JSON.stringify({ type: 'ACCESS_SUSPENDED', message: 'Waiting for re-authorization' }),
      });
    },
    onStreamRecover: (_decision, subscriber) => {
      subscriber.next({
        data: JSON.stringify({ type: 'ACCESS_RESTORED', message: 'Authorization restored' }),
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
   * @EnforceRecoverableIfDenied with callback-driven termination.
   *
   * On DENY: onStreamDeny injects a final GOODBYE event, then terminates
   * the stream via emitter.error(). This overrides the default behavior
   * (which would keep the stream alive). The client receives the GOODBYE
   * event followed by the error.
   */
  @EnforceRecoverableIfDenied({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
    onStreamDeny: (_decision, emitter) => {
      emitter.next({
        data: JSON.stringify({ type: 'GOODBYE', message: 'Stream terminated by callback' }),
      });
      emitter.error(new ForbiddenException('Callback chose to terminate stream'));
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
   * @EnforceDropWhileDenied with deny/recover callbacks.
   *
   * On DENY: onStreamDeny injects an ACCESS_SUSPENDED event.
   * On re-PERMIT: onStreamRecover injects an ACCESS_RESTORED event.
   * Between transitions, data is silently dropped (same as plain
   * @EnforceDropWhileDenied). The callbacks add in-band signaling
   * without changing the drop-while-denied core behavior.
   */
  @EnforceDropWhileDenied({
    action: 'stream:heartbeat',
    resource: 'heartbeat',
    onStreamDeny: (_decision, emitter) => {
      emitter.next({
        data: JSON.stringify({ type: 'ACCESS_SUSPENDED', message: 'Events paused by policy' }),
      });
    },
    onStreamRecover: (_decision, emitter) => {
      emitter.next({
        data: JSON.stringify({ type: 'ACCESS_RESTORED', message: 'Events resumed' }),
      });
    },
  })
  heartbeatDropWithCallbacks(): Observable<any> {
    return interval(2000).pipe(
      map((i) => ({
        data: JSON.stringify({ seq: i, ts: new Date().toISOString() }),
      })),
    );
  }
}
