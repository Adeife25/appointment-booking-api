import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, UpdateReviewDto } from './dto/review.dto';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review a completed appointment (customer)' })
  create(@Req() req: { user: AuthUser }, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user.id, dto);
  }

  @Get('providers/:providerId/reviews')
  @ApiBearerAuth()
  @ApiParam({ name: 'providerId', description: 'Provider profile ID' })
  @ApiOperation({ summary: 'List reviews for a provider (public)' })
  findAllForProvider(
    @Param('providerId') providerId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reviewsService.findAllForProvider(
      providerId,
      query.page,
      query.limit,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own review' })
  update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.CUSTOMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own review' })
  remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.reviewsService.remove(req.user.id, id);
  }
}
