import { Test, TestingModule } from '@nestjs/testing';
import { TontinesController } from './tontines.controller';
import { TontinesService } from './tontines.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TontinesController', () => {
  let controller: TontinesController;
  let service: TontinesService;

  const mockService = {
    createGroup: jest.fn(),
    findAllGroups: jest.fn(),
    findOneGroup: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    recordPayment: jest.fn(),
    disburseRound: jest.fn(),
    getPaymentStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TontinesController],
      providers: [
        { provide: TontinesService, useValue: mockService },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<TontinesController>(TontinesController);
    service = module.get<TontinesService>(TontinesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createGroup', () => {
    it('should call service.createGroup with dto and user.sub', async () => {
      const dto = { name: 'Tontine A', contributionAmount: 50000, frequency: 'MONTHLY', maxMembers: 10, agencyId: 'a1' };
      const user = { sub: 'user-1' };
      mockService.createGroup.mockResolvedValue({ id: 'grp-1' });

      const result = await controller.createGroup(dto as any, user);

      expect(result).toEqual({ id: 'grp-1' });
      expect(mockService.createGroup).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('findAllGroups', () => {
    it('should call service.findAllGroups with parsed params', async () => {
      mockService.findAllGroups.mockResolvedValue({ data: [], total: 0 });

      await controller.findAllGroups('a1', 'ACTIVE', '2', '10');

      expect(mockService.findAllGroups).toHaveBeenCalledWith({
        agencyId: 'a1',
        status: 'ACTIVE',
        page: 2,
        limit: 10,
      });
    });

    it('should use default page and limit when not provided', async () => {
      mockService.findAllGroups.mockResolvedValue({ data: [], total: 0 });

      await controller.findAllGroups(undefined, undefined, undefined, undefined);

      expect(mockService.findAllGroups).toHaveBeenCalledWith({
        agencyId: undefined,
        status: undefined,
        page: 1,
        limit: 20,
      });
    });
  });

  describe('findOneGroup', () => {
    it('should call service.findOneGroup with id', async () => {
      mockService.findOneGroup.mockResolvedValue({ id: 'grp-1' });

      const result = await controller.findOneGroup('grp-1');

      expect(result).toEqual({ id: 'grp-1' });
      expect(mockService.findOneGroup).toHaveBeenCalledWith('grp-1');
    });
  });

  describe('addMember', () => {
    it('should call service.addMember with groupId, dto, and user.sub', async () => {
      const dto = { clientId: 'client-1' };
      const user = { sub: 'user-1' };
      mockService.addMember.mockResolvedValue({ id: 'm1' });

      const result = await controller.addMember('grp-1', dto as any, user);

      expect(result).toEqual({ id: 'm1' });
      expect(mockService.addMember).toHaveBeenCalledWith('grp-1', dto, 'user-1');
    });
  });

  describe('removeMember', () => {
    it('should call service.removeMember with groupId, memberId, and user.sub', async () => {
      const user = { sub: 'user-1' };
      mockService.removeMember.mockResolvedValue({ id: 'm1', isActive: false });

      const result = await controller.removeMember('grp-1', 'm1', user);

      expect(result.isActive).toBe(false);
      expect(mockService.removeMember).toHaveBeenCalledWith('grp-1', 'm1', 'user-1');
    });
  });

  describe('recordPayment', () => {
    it('should call service.recordPayment with groupId, roundId, dto, and user.sub', async () => {
      const dto = { memberId: 'm1', amount: 50000 };
      const user = { sub: 'user-1' };
      mockService.recordPayment.mockResolvedValue({ id: 'pay-1', isPaid: true });

      const result = await controller.recordPayment('grp-1', 'r1', dto as any, user);

      expect(result.isPaid).toBe(true);
      expect(mockService.recordPayment).toHaveBeenCalledWith('grp-1', 'r1', dto, 'user-1');
    });
  });

  describe('disburseRound', () => {
    it('should call service.disburseRound with groupId, roundId, and user.sub', async () => {
      const user = { sub: 'user-1' };
      mockService.disburseRound.mockResolvedValue({
        roundNumber: 1,
        disbursedAmount: 250000,
        groupCompleted: false,
      });

      const result = await controller.disburseRound('grp-1', 'r1', user);

      expect(result.disbursedAmount).toBe(250000);
      expect(mockService.disburseRound).toHaveBeenCalledWith('grp-1', 'r1', 'user-1');
    });
  });

  describe('getPaymentStatus', () => {
    it('should call service.getPaymentStatus with groupId and roundId', async () => {
      mockService.getPaymentStatus.mockResolvedValue({
        totalMembers: 5,
        paidCount: 3,
        unpaidCount: 2,
      });

      const result = await controller.getPaymentStatus('grp-1', 'r1');

      expect(result.totalMembers).toBe(5);
      expect(mockService.getPaymentStatus).toHaveBeenCalledWith('grp-1', 'r1');
    });
  });
});
