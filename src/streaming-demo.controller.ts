import { Controller, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { StreamingDemoService } from './streaming-demo.service';

/**
 * SSE endpoints for streaming authorization demos.
 *
 * Each endpoint delegates to StreamingDemoService where the actual
 * streaming enforcement decorators (@EnforceTillDenied, @EnforceDropWhileDenied,
 * @EnforceRecoverableIfDenied) are applied. The policy cycles PERMIT/DENY
 * based on the current second (0-19 permit, 20-39 deny, 40-59 permit).
 */
@Controller('api/streaming')
export class StreamingDemoController {
  constructor(private readonly streamingService: StreamingDemoService) {}

  /**
   * Stream that terminates permanently on first DENY decision.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/till-denied
   */
  @Sse('heartbeat/till-denied')
  heartbeatTillDenied(): Observable<any> {
    return this.streamingService.heartbeatTillDenied();
  }

  /**
   * Stream that silently drops events during DENY periods, resumes on PERMIT.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/drop-while-denied
   */
  @Sse('heartbeat/drop-while-denied')
  heartbeatDropWhileDenied(): Observable<any> {
    return this.streamingService.heartbeatDropWhileDenied();
  }

  /**
   * Stream that sends ACCESS_SUSPENDED/ACCESS_RESTORED signals on policy changes.
   * Connect with: curl -N http://localhost:3000/api/streaming/heartbeat/recoverable
   */
  @Sse('heartbeat/recoverable')
  heartbeatRecoverable(): Observable<any> {
    return this.streamingService.heartbeatRecoverable();
  }
}
