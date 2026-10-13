import { PatientDeviceDataService } from './patient-device-data.service';
import { TreatmentDecision } from '../database/enums';

describe('patient device treatment data', () => {
  it('keeps completed treatment history but only returns schedules for active treatments', async () => {
    const activeCourse = {
      id: 'course-active', patientId: 'patient-1', startDate: '2026-09-01',
      initialTargetEndDate: '2027-03-01', completedAt: null, finalDecision: null,
      continuedTargetEndDate: null,
    };
    const completedCourse = {
      id: 'course-completed', patientId: 'patient-1', startDate: '2026-01-01',
      initialTargetEndDate: '2026-07-01', completedAt: new Date('2026-07-02T00:00:00.000Z'),
      finalDecision: TreatmentDecision.COMPLETED, continuedTargetEndDate: null,
    };
    const treatmentRepository = {
      find: jest.fn().mockResolvedValue([activeCourse, completedCourse]),
    };
    const dataSource = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM patients')) return Promise.resolve([{ id: 'patient-1', fullName: 'Pasien', address: 'Alamat' }]);
        return Promise.resolve([{ treatmentCourseId: 'course-active', scheduledDate: '2026-10-10' }]);
      }),
    };
    const service = new PatientDeviceDataService(treatmentRepository as never, dataSource as never);

    const result = await service.getCurrentData('patient-1') as {
      treatmentCourses: Array<{ id: string; displayMessage: string | null }>;
      controlSchedules: Array<{ treatmentCourseId: string }>;
    };

    expect(result.treatmentCourses.map((course) => course.id)).toEqual(['course-active', 'course-completed']);
    expect(result.treatmentCourses[1].displayMessage).toBe('Pengobatan selesai');
    expect(result.controlSchedules).toEqual([{ treatmentCourseId: 'course-active', scheduledDate: '2026-10-10' }]);
    expect(dataSource.query).toHaveBeenLastCalledWith(expect.stringContaining('FROM control_schedule'), [['course-active']]);
  });
});
