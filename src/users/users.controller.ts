import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { SwitchRoleDto } from './dto/switch-role.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Req() req: { user: AuthUser }) {
    return this.usersService.getMe(req.user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@Req() req: { user: AuthUser }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(req.user.id, dto);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Change current user password' })
  changePassword(
    @Req() req: { user: AuthUser },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(req.user.id, dto);
  }

  @Patch('me/role')
  @ApiOperation({
    summary: 'Switch account type between CUSTOMER and PROVIDER',
  })
  switchRole(@Req() req: { user: AuthUser }, @Body() dto: SwitchRoleDto) {
    return this.usersService.switchRole(req.user.id, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Soft-delete current user account' })
  deleteMe(@Req() req: { user: AuthUser }) {
    return this.usersService.deleteMe(req.user.id);
  }

  @Get('me/notification-settings')
  @ApiOperation({ summary: 'Get notification preferences' })
  getNotificationSettings(@Req() req: { user: AuthUser }) {
    return this.usersService.getNotificationSettings(req.user.id);
  }

  @Patch('me/notification-settings')
  @ApiOperation({ summary: 'Update notification preferences' })
  updateNotificationSettings(
    @Req() req: { user: AuthUser },
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.usersService.updateNotificationSettings(req.user.id, dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List all users' })
  listUsers(@Query() query: PaginationQueryDto) {
    return this.usersService.listUsers(query.page, query.limit);
  }

  @Patch(':id/activate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiOperation({ summary: '[Admin] Activate a user account' })
  activateUser(@Param('id') id: string) {
    return this.usersService.activateUser(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiOperation({ summary: '[Admin] Deactivate a user account' })
  deactivateUser(@Param('id') id: string) {
    return this.usersService.deactivateUser(id);
  }
}
