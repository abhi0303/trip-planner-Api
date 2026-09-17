import { ApiProperty } from '@nestjs/swagger';

/** Simple acknowledgement payload for actions with nothing else to return. */
export class MessageDto {
  @ApiProperty({ example: 'Signed out' })
  message: string;
}
