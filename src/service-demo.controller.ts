import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { PatientService } from './patient.service';

/**
 * Thin controller -- no @PreEnforce/@PostEnforce here.
 * All policy enforcement happens on the PatientService methods.
 *
 * This demonstrates that SAPL decorators work on any injectable class,
 * not just controllers.
 */
@Controller('api/services')
export class ServiceDemoController {
  constructor(private readonly patientService: PatientService) {}

  @Get('patients/find')
  findPatient(@Query('name') name: string) {
    return this.patientService.findPatient(name);
  }

  @Get('patients/search')
  searchPatients(@Query('q') query: string) {
    return this.patientService.searchPatients(query);
  }

  @Get('patients/:id/summary')
  getPatientSummary(@Param('id') id: string) {
    return this.patientService.getPatientSummary(id);
  }

  @Get('patients/:id')
  getPatientDetail(@Param('id') id: string) {
    return this.patientService.getPatientDetail(id);
  }

  @Get('patients')
  listPatients() {
    return this.patientService.listPatients();
  }

  @HttpCode(200)
  @Post('transfer')
  transfer(@Query('amount') amount: string) {
    return this.patientService.transfer(Number(amount));
  }
}
