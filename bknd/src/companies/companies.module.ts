import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';

@Module({ imports: [AuthModule, UsersModule], controllers: [CompaniesController], providers: [CompaniesService] })
export class CompaniesModule {}
