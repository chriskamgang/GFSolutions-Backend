import { Test, TestingModule } from '@nestjs/testing';
import { CheckbooksController } from './checkbooks.controller';
import { CheckbooksService } from './checkbooks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CheckbooksController', () => {
  let controller: CheckbooksController;
  let service: jest.Mocked<CheckbooksService>;

  const mockService = {
    findChequeByNumber: jest.fn(),
    getAccountInfo: jest.fn(),
    requestCheckbook: jest.fn(),
    getCheckbooks: jest.fn(),
    getCheques: jest.fn(),
    getRegistre: jest.fn(),
    emitCheque: jest.fn(),
    encaisserCheque: jest.fn(),
    opposeCheque: jest.fn(),
    opposeCheckbook: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckbooksController],
      providers: [
        { provide: CheckbooksService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<CheckbooksController>(CheckbooksController);
    service = module.get(CheckbooksService) as jest.Mocked<CheckbooksService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==================== FIND CHEQUE BY NUMBER ====================

  describe('findChequeByNumber', () => {
    it('should call service.findChequeByNumber', async () => {
      const expected = { cheque: {}, account: {}, client: {} };
      mockService.findChequeByNumber.mockResolvedValue(expected as any);

      const result = await controller.findChequeByNumber('CHQ-000001');
      expect(result).toEqual(expected);
      expect(mockService.findChequeByNumber).toHaveBeenCalledWith('CHQ-000001');
    });
  });

  // ==================== GET ACCOUNT INFO ====================

  describe('getAccountInfo', () => {
    it('should call service.getAccountInfo', async () => {
      const expected = { account: {}, client: {}, checkbooks: [] };
      mockService.getAccountInfo.mockResolvedValue(expected as any);

      const result = await controller.getAccountInfo('acc-1');
      expect(result).toEqual(expected);
      expect(mockService.getAccountInfo).toHaveBeenCalledWith('acc-1');
    });
  });

  // ==================== REQUEST CHECKBOOK ====================

  describe('requestCheckbook', () => {
    it('should call service.requestCheckbook with dto and user.sub', async () => {
      const user = { sub: 'user-1' };
      const dto: any = { accountId: 'acc-1', totalLeaves: 25 };
      const expected = { id: 'cb-1', totalLeaves: 25, cheques: [] };
      mockService.requestCheckbook.mockResolvedValue(expected as any);

      const result = await controller.requestCheckbook(dto, user);
      expect(result).toEqual(expected);
      expect(mockService.requestCheckbook).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  // ==================== GET CHECKBOOKS ====================

  describe('getCheckbooks', () => {
    it('should call service.getCheckbooks with accountId', async () => {
      const expected = [{ id: 'cb-1', chequeCounts: {} }];
      mockService.getCheckbooks.mockResolvedValue(expected as any);

      const result = await controller.getCheckbooks('acc-1');
      expect(result).toEqual(expected);
      expect(mockService.getCheckbooks).toHaveBeenCalledWith('acc-1');
    });
  });

  // ==================== GET CHEQUES ====================

  describe('getCheques', () => {
    it('should call service.getCheques with parsed query params', async () => {
      const expected = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockService.getCheques.mockResolvedValue(expected);

      const result = await controller.getCheques('cb-1', 'acc-1', 'EMIS', '2', '10');
      expect(result).toEqual(expected);
      expect(mockService.getCheques).toHaveBeenCalledWith({
        checkbookId: 'cb-1',
        accountId: 'acc-1',
        status: 'EMIS',
        page: 2,
        limit: 10,
      });
    });

    it('should use default page and limit when not provided', async () => {
      mockService.getCheques.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await controller.getCheques(undefined, undefined, undefined, undefined, undefined);

      expect(mockService.getCheques).toHaveBeenCalledWith({
        checkbookId: undefined,
        accountId: undefined,
        status: undefined,
        page: 1,
        limit: 20,
      });
    });
  });

  // ==================== GET REGISTRE ====================

  describe('getRegistre', () => {
    it('should call service.getRegistre with parsed params', async () => {
      const expected = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockService.getRegistre.mockResolvedValue(expected);

      const result = await controller.getRegistre(
        'acc-1', 'EMIS', '2025-01-01', '2025-12-31', '1', '20',
      );
      expect(result).toEqual(expected);
      expect(mockService.getRegistre).toHaveBeenCalledWith({
        accountId: 'acc-1',
        status: 'EMIS',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        page: 1,
        limit: 20,
      });
    });
  });

  // ==================== EMIT CHEQUE ====================

  describe('emitCheque', () => {
    it('should call service.emitCheque with id, dto and user.sub', async () => {
      const user = { sub: 'user-1' };
      const dto: any = { chequeNumber: 'CHQ-000001', amount: 100000, beneficiary: 'Jean' };
      const expected = { id: 'chq-1', status: 'EMIS' };
      mockService.emitCheque.mockResolvedValue(expected as any);

      const result = await controller.emitCheque('chq-1', dto, user);
      expect(result).toEqual(expected);
      expect(mockService.emitCheque).toHaveBeenCalledWith('chq-1', dto, 'user-1');
    });
  });

  // ==================== ENCAISSER CHEQUE ====================

  describe('encaisserCheque', () => {
    it('should call service.encaisserCheque with id, dto and user.sub', async () => {
      const user = { sub: 'user-1' };
      const dto: any = { chequeNumber: 'CHQ-000001', accountId: 'dest-acc' };
      const expected = { cheque: {}, transaction: {} };
      mockService.encaisserCheque.mockResolvedValue(expected as any);

      const result = await controller.encaisserCheque('chq-1', dto, user);
      expect(result).toEqual(expected);
      expect(mockService.encaisserCheque).toHaveBeenCalledWith('chq-1', dto, 'user-1');
    });
  });

  // ==================== RETRAIT CHEQUE ====================

  describe('retraitCheque', () => {
    it('should call service.encaisserCheque without accountId for retrait', async () => {
      const user = { sub: 'user-1' };
      const dto: any = { chequeNumber: 'CHQ-000001' };
      const expected = { cheque: {}, transaction: {} };
      mockService.encaisserCheque.mockResolvedValue(expected as any);

      const result = await controller.retraitCheque('chq-1', dto, user);
      expect(result).toEqual(expected);
      expect(mockService.encaisserCheque).toHaveBeenCalledWith(
        'chq-1',
        { chequeNumber: 'CHQ-000001' },
        'user-1',
      );
    });
  });

  // ==================== OPPOSE CHEQUE ====================

  describe('opposeCheque', () => {
    it('should call service.opposeCheque with id, dto and user.sub', async () => {
      const user = { sub: 'user-1' };
      const dto: any = { motif: 'PERTE' };
      const expected = { id: 'chq-1', status: 'OPPOSITION' };
      mockService.opposeCheque.mockResolvedValue(expected as any);

      const result = await controller.opposeCheque('chq-1', dto, user);
      expect(result).toEqual(expected);
      expect(mockService.opposeCheque).toHaveBeenCalledWith('chq-1', dto, 'user-1');
    });
  });

  // ==================== OPPOSE CHECKBOOK ====================

  describe('opposeCheckbook', () => {
    it('should call service.opposeCheckbook with id, motif and user.sub', async () => {
      const user = { sub: 'user-1' };
      const dto: any = { motif: 'VOL' };
      const expected = { checkbookId: 'cb-1', chequesAffected: 5, motif: 'VOL' };
      mockService.opposeCheckbook.mockResolvedValue(expected);

      const result = await controller.opposeCheckbook('cb-1', dto, user);
      expect(result).toEqual(expected);
      expect(mockService.opposeCheckbook).toHaveBeenCalledWith('cb-1', 'VOL', 'user-1');
    });
  });
});
