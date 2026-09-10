import type { PrismaClient } from "@prisma/client";

export interface CreateCompetitorInput {
  name: string;
  advertiserId: string;
  brandtrackerId?: string;
  category?: string;
  notes?: string;
  active?: boolean;
}

export class CompetitorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActive() {
    return this.prisma.competitor.findMany({ where: { active: true } });
  }

  async listAll() {
    return this.prisma.competitor.findMany();
  }

  async findById(id: string) {
    return this.prisma.competitor.findUnique({ where: { id } });
  }

  async create(input: CreateCompetitorInput) {
    return this.prisma.competitor.create({
      data: {
        name: input.name,
        advertiserId: input.advertiserId,
        brandtrackerId: input.brandtrackerId,
        category: input.category,
        notes: input.notes,
        active: input.active ?? true,
      },
    });
  }

  async setActive(id: string, active: boolean) {
    return this.prisma.competitor.update({ where: { id }, data: { active } });
  }
}
