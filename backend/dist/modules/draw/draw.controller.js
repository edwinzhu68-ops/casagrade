"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DrawController_1, AdminController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = exports.DrawController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const draw_entity_1 = require("../../entities/draw.entity");
let DrawController = DrawController_1 = class DrawController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(DrawController_1.name);
    }
    async getLatestDraw() {
        const draw = await this.dataSource.getRepository(draw_entity_1.Draw).findOne({
            where: { status: 'completed' },
            order: { draw_id: 'DESC' },
        });
        if (!draw) {
            return {
                draw: null,
                message: '暂无开奖记录',
            };
        }
        let winning;
        try {
            winning = JSON.parse(draw.winning_numbers);
        }
        catch {
            winning = { primer: draw.winning_numbers };
        }
        return {
            draw: {
                drawId: draw.draw_id,
                primer: winning.primer || winning.primeras || '',
                segundo: winning.segundo || winning.segundas || '',
                tercero: winning.tercero || winning.terceras || winning.ultimas || '',
                drawTime: draw.draw_time,
                drawDate: draw.draw_date,
                status: draw.status,
            },
        };
    }
    async setDrawTime(dto) {
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        let draw = await drawRepo.findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        if (draw) {
            await drawRepo.update(draw.draw_id, {
                draw_time: dto.drawTime,
            });
            draw.draw_time = dto.drawTime;
        }
        else {
            draw = drawRepo.create({
                draw_date: new Date(),
                draw_time: dto.drawTime,
                status: 'pending',
                winning_numbers: '',
            });
            await drawRepo.save(draw);
        }
        this.logger.log(`开奖时间设置: ${draw.draw_time}, 期次: ${draw.draw_id}`);
        return {
            success: true,
            drawId: draw.draw_id,
            drawTime: draw.draw_time,
        };
    }
    async manualDraw(dto) {
        let draw = await this.dataSource.getRepository(draw_entity_1.Draw).findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        if (!draw) {
            draw = this.dataSource.getRepository(draw_entity_1.Draw).create({
                draw_date: new Date(),
                draw_time: dto.drawTime || new Date().toTimeString().split(' ')[0],
                status: 'completed',
            });
        }
        const winningNumbers = {
            primer: (dto.primer || '').padStart(4, '0'),
            segundo: (dto.segundo || '').padStart(4, '0'),
            tercero: (dto.tercero || '').padStart(4, '0'),
        };
        await this.dataSource.getRepository(draw_entity_1.Draw).update(draw.draw_id, {
            winning_numbers: JSON.stringify(winningNumbers),
            status: 'completed',
            draw_time: dto.drawTime || draw.draw_time,
        });
        this.logger.log(`开奖完成: ${JSON.stringify(winningNumbers)}`);
        return {
            success: true,
            drawId: draw.draw_id,
            primer: winningNumbers.primer,
            segundo: winningNumbers.segundo,
            tercero: winningNumbers.tercero,
        };
    }
};
exports.DrawController = DrawController;
__decorate([
    (0, common_1.Get)('latest'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "getLatestDraw", null);
__decorate([
    (0, common_1.Post)('time'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "setDrawTime", null);
__decorate([
    (0, common_1.Post)('manual'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DrawController.prototype, "manualDraw", null);
exports.DrawController = DrawController = DrawController_1 = __decorate([
    (0, common_1.Controller)('draw'),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], DrawController);
let AdminController = AdminController_1 = class AdminController {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AdminController_1.name);
    }
    async adminDraw(body) {
        const { primer, segundo, tercero, drawTime } = body;
        let draw = await this.dataSource.getRepository(draw_entity_1.Draw).findOne({
            where: { status: 'pending' },
            order: { draw_id: 'DESC' },
        });
        const drawRepo = this.dataSource.getRepository(draw_entity_1.Draw);
        if (!draw) {
            const winningNumbers = {
                primer: (primer || '').padStart(4, '0'),
                segundo: (segundo || '').padStart(4, '0'),
                tercero: (tercero || '').padStart(4, '0'),
            };
            draw = drawRepo.create({
                draw_date: new Date(),
                draw_time: drawTime || new Date().toTimeString().split(' ')[0],
                status: 'completed',
                winning_numbers: JSON.stringify(winningNumbers),
            });
            await drawRepo.save(draw);
            this.logger.log(`管理员开奖(新期次): ${JSON.stringify(winningNumbers)}`);
            return {
                success: true,
                drawId: draw.draw_id,
                ...winningNumbers,
            };
        }
        const winningNumbers = {
            primer: (primer || '').padStart(4, '0'),
            segundo: (segundo || '').padStart(4, '0'),
            tercero: (tercero || '').padStart(4, '0'),
        };
        await drawRepo.update(draw.draw_id, {
            winning_numbers: JSON.stringify(winningNumbers),
            status: 'completed',
            draw_time: drawTime || draw.draw_time,
        });
        this.logger.log(`管理员开奖: ${JSON.stringify(winningNumbers)}`);
        return {
            success: true,
            drawId: draw.draw_id,
            ...winningNumbers,
        };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Post)('draw'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "adminDraw", null);
exports.AdminController = AdminController = AdminController_1 = __decorate([
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], AdminController);
//# sourceMappingURL=draw.controller.js.map