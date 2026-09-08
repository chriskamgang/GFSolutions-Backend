import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';

describe('ReportsController', () => {
  let controller: ReportsController;
  let reportsService: ReportsService;

  const mockReportsService = {
    getKPIs: jest.fn(),
    getMonthlyReport: jest.fn(),
    getYearlyTrend: jest.fn(),
    getCOBACReport: jest.fn(),
    getEnrichedKPIs: jest.fn(),
    getReportByAgency: jest.fn(),
    getDailyReport: jest.fn(),
    getWeeklyReport: jest.fn(),
    getAccountOpeningsReport: jest.fn(),
    calculateProvisioning: jest.fn(),
    generateTafire: jest.fn(),
    generateCobacExcel: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockReportsService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
    reportsService = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // getKPIs
  // ==========================================================

  describe('getKPIs', () => {
    it('should call reportsService.getKPIs and return result', async () => {
      const kpis = { clientele: {}, comptes: {}, credits: {} };
      mockReportsService.getKPIs.mockResolvedValue(kpis);

      const result = await controller.getKPIs();

      expect(result).toEqual(kpis);
      expect(mockReportsService.getKPIs).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // getMonthly
  // ==========================================================

  describe('getMonthly', () => {
    it('should pass year and month as numbers to service', async () => {
      mockReportsService.getMonthlyReport.mockResolvedValue({ periode: '07/2026' });

      await controller.getMonthly('2026', '7');

      expect(mockReportsService.getMonthlyReport).toHaveBeenCalledWith(2026, 7);
    });

    it('should default to current date when no params provided', async () => {
      mockReportsService.getMonthlyReport.mockResolvedValue({ periode: 'xx/xxxx' });
      const now = new Date();

      await controller.getMonthly(undefined, undefined);

      expect(mockReportsService.getMonthlyReport).toHaveBeenCalledWith(
        now.getFullYear(),
        now.getMonth() + 1,
      );
    });
  });

  // ==========================================================
  // getYearlyTrend
  // ==========================================================

  describe('getYearlyTrend', () => {
    it('should call reportsService.getYearlyTrend', async () => {
      const trend = [{ mois: '07/2026', depots: 100 }];
      mockReportsService.getYearlyTrend.mockResolvedValue(trend);

      const result = await controller.getYearlyTrend();

      expect(result).toEqual(trend);
      expect(mockReportsService.getYearlyTrend).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // getCOBACReport
  // ==========================================================

  describe('getCOBACReport', () => {
    it('should call reportsService.getCOBACReport', async () => {
      const cobac = { conformiteGlobale: true };
      mockReportsService.getCOBACReport.mockResolvedValue(cobac);

      const result = await controller.getCOBACReport();

      expect(result).toEqual(cobac);
      expect(mockReportsService.getCOBACReport).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // getEnrichedKPIs
  // ==========================================================

  describe('getEnrichedKPIs', () => {
    it('should call reportsService.getEnrichedKPIs', async () => {
      const enriched = { cotisations: {}, revenus: {} };
      mockReportsService.getEnrichedKPIs.mockResolvedValue(enriched);

      const result = await controller.getEnrichedKPIs();

      expect(result).toEqual(enriched);
    });
  });

  // ==========================================================
  // getByAgency
  // ==========================================================

  describe('getByAgency', () => {
    it('should pass agencyId and optional year/month', async () => {
      mockReportsService.getReportByAgency.mockResolvedValue({ agency: {} });

      await controller.getByAgency('ag-1', '2026', '7');

      expect(mockReportsService.getReportByAgency).toHaveBeenCalledWith('ag-1', 2026, 7);
    });

    it('should pass undefined for year/month when not provided', async () => {
      mockReportsService.getReportByAgency.mockResolvedValue({ agency: {} });

      await controller.getByAgency('ag-1');

      expect(mockReportsService.getReportByAgency).toHaveBeenCalledWith('ag-1', undefined, undefined);
    });
  });

  // ==========================================================
  // getDailyReport
  // ==========================================================

  describe('getDailyReport', () => {
    it('should pass date string to service', async () => {
      mockReportsService.getDailyReport.mockResolvedValue({ date: '2026-07-30' });

      await controller.getDailyReport('2026-07-30');

      expect(mockReportsService.getDailyReport).toHaveBeenCalledWith('2026-07-30');
    });

    it('should pass undefined when no date provided', async () => {
      mockReportsService.getDailyReport.mockResolvedValue({ date: '2026-07-30' });

      await controller.getDailyReport();

      expect(mockReportsService.getDailyReport).toHaveBeenCalledWith(undefined);
    });
  });

  // ==========================================================
  // getWeeklyReport
  // ==========================================================

  describe('getWeeklyReport', () => {
    it('should pass startDate to service', async () => {
      mockReportsService.getWeeklyReport.mockResolvedValue({ semaine: {} });

      await controller.getWeeklyReport('2026-07-27');

      expect(mockReportsService.getWeeklyReport).toHaveBeenCalledWith('2026-07-27');
    });
  });

  // ==========================================================
  // getAccountOpenings
  // ==========================================================

  describe('getAccountOpenings', () => {
    it('should pass startDate and endDate to service', async () => {
      mockReportsService.getAccountOpeningsReport.mockResolvedValue({ totalComptesOuverts: 5 });

      await controller.getAccountOpenings('2026-01-01', '2026-07-30');

      expect(mockReportsService.getAccountOpeningsReport).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-07-30',
      );
    });
  });

  // ==========================================================
  // getProvisioning
  // ==========================================================

  describe('getProvisioning', () => {
    it('should call calculateProvisioning with optional agencyId', async () => {
      mockReportsService.calculateProvisioning.mockResolvedValue({ totalProvision: 100000 });

      await controller.getProvisioning('ag-1');

      expect(mockReportsService.calculateProvisioning).toHaveBeenCalledWith('ag-1');
    });

    it('should call without agencyId when not provided', async () => {
      mockReportsService.calculateProvisioning.mockResolvedValue({ totalProvision: 0 });

      await controller.getProvisioning();

      expect(mockReportsService.calculateProvisioning).toHaveBeenCalledWith(undefined);
    });
  });

  // ==========================================================
  // getTafire
  // ==========================================================

  describe('getTafire', () => {
    it('should parse year string and pass to service', async () => {
      mockReportsService.generateTafire.mockResolvedValue({ year: 2026 });

      await controller.getTafire('2026');

      expect(mockReportsService.generateTafire).toHaveBeenCalledWith(2026, undefined);
    });

    it('should pass optional agencyId', async () => {
      mockReportsService.generateTafire.mockResolvedValue({ year: 2026 });

      await controller.getTafire('2026', 'ag-1');

      expect(mockReportsService.generateTafire).toHaveBeenCalledWith(2026, 'ag-1');
    });

    it('should default to current year for invalid year string', async () => {
      mockReportsService.generateTafire.mockResolvedValue({ year: 2026 });

      await controller.getTafire('invalid');

      expect(mockReportsService.generateTafire).toHaveBeenCalledWith(
        new Date().getFullYear(),
        undefined,
      );
    });
  });

  // ==========================================================
  // getCobacExcel
  // ==========================================================

  describe('getCobacExcel', () => {
    it('should set response headers and send buffer', async () => {
      const mockBuffer = Buffer.from('fake-excel');
      mockReportsService.generateCobacExcel.mockResolvedValue(mockBuffer);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.getCobacExcel(mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('Rapport_COBAC_'),
      );
      expect(mockRes.send).toHaveBeenCalledWith(mockBuffer);
    });
  });
});
