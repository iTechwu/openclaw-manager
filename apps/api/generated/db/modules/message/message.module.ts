import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { PrismaModule } from '@app/prisma';

@Module({
  imports: [PrismaModule],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageDbModule {}
