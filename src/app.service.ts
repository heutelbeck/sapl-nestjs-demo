import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return { message: 'hello' };
  }

  getExportData(pilotId: string, sequenceId: string) {
    return { pilotId, sequenceId, data: 'export-payload' };
  }
}
