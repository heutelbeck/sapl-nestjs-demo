import { Injectable } from '@nestjs/common';
import { PreEnforce, PostEnforce } from '@sapl/nestjs';

export interface PatientRecord {
  id: string;
  name: string;
  ssn: string;
  diagnosis: string;
  classification: string;
}

@Injectable()
export class PatientService {
  private readonly patients: PatientRecord[] = [
    { id: 'P-001', name: 'Jane Doe', ssn: '123-45-6789', diagnosis: 'healthy', classification: 'INTERNAL' },
    { id: 'P-002', name: 'John Smith', ssn: '987-65-4321', diagnosis: 'checkup', classification: 'CONFIDENTIAL' },
    { id: 'P-003', name: 'Alice Johnson', ssn: '555-12-3456', diagnosis: 'healthy', classification: 'PUBLIC' },
  ];

  @PreEnforce({ action: 'service:listPatients', resource: 'patients' })
  listPatients(): PatientRecord[] {
    return [...this.patients];
  }

  @PreEnforce({ action: 'service:findPatient', resource: 'patient' })
  findPatient(name: string): PatientRecord[] {
    return this.patients.filter(p => p.name.toLowerCase().includes(name.toLowerCase()));
  }

  @PostEnforce({
    action: 'service:getPatientDetail',
    resource: (ctx) => ({ type: 'patientDetail', data: ctx.returnValue }),
  })
  getPatientDetail(id: string): PatientRecord | undefined {
    return this.patients.find(p => p.id === id);
  }

  @PreEnforce({ action: 'service:getPatientSummary', resource: 'patientSummary' })
  getPatientSummary(id: string): any {
    const patient = this.patients.find(p => p.id === id);
    return patient ? { ...patient, insurance: 'INS-9876-XYZ' } : undefined;
  }

  @PreEnforce({ action: 'service:searchPatients', resource: 'patientSearch' })
  searchPatients(query: string): PatientRecord[] {
    return this.patients.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.diagnosis.toLowerCase().includes(query.toLowerCase()),
    );
  }

  @PreEnforce({ action: 'service:transfer', resource: 'account' })
  transfer(amount: number): string {
    return `Transferred ${amount}`;
  }
}
