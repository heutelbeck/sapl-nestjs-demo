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
    {
      id: 'P-001',
      name: 'Jane Doe',
      ssn: '123-45-6789',
      diagnosis: 'healthy',
      classification: 'INTERNAL',
    },
    {
      id: 'P-002',
      name: 'John Smith',
      ssn: '987-65-4321',
      diagnosis: 'checkup',
      classification: 'CONFIDENTIAL',
    },
    {
      id: 'P-003',
      name: 'Alice Johnson',
      ssn: '555-12-3456',
      diagnosis: 'healthy',
      classification: 'PUBLIC',
    },
  ];

  getPatientById(id: string): PatientRecord | undefined {
    return this.patients.find((p) => p.id === id);
  }

  getAllPatients(): PatientRecord[] {
    return [...this.patients];
  }

  @PreEnforce({ action: 'listPatients', resource: 'patients' })
  listPatients(): PatientRecord[] {
    return [...this.patients];
  }

  @PreEnforce({ action: 'findPatient', resource: 'patient' })
  findPatient(name: string): PatientRecord[] {
    return this.patients.filter((p) =>
      p.name.toLowerCase().includes(name.toLowerCase()),
    );
  }

  @PostEnforce({
    action: 'getPatientDetail',
    resource: (ctx) => ({ type: 'patientDetail', data: ctx.returnValue }),
  })
  getPatientDetail(id: string): PatientRecord | undefined {
    return this.patients.find((p) => p.id === id);
  }

  @PreEnforce({
    action: 'getPatientSummary',
    resource: 'patientSummary',
  })
  getPatientSummary(id: string): any {
    const patient = this.patients.find((p) => p.id === id);
    return patient ? { ...patient, insurance: 'INS-9876-XYZ' } : undefined;
  }

  @PreEnforce({ action: 'searchPatients', resource: 'patientSearch' })
  searchPatients(query: string): PatientRecord[] {
    return this.patients.filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.diagnosis.toLowerCase().includes(query.toLowerCase()),
    );
  }

  @PreEnforce({ action: 'transfer', resource: 'account' })
  transfer(amount: number) {
    return { transferred: amount, recipient: 'default-account', status: 'completed' };
  }
}
