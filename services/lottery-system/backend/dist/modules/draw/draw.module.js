"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const draw_controller_1 = require("./draw.controller");
const draw_entity_1 = require("../../entities/draw.entity");
const draw_day_service_1 = require("./draw-day.service");
let DrawModule = class DrawModule {
};
exports.DrawModule = DrawModule;
exports.DrawModule = DrawModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([draw_entity_1.Draw])],
        controllers: [draw_controller_1.DrawController, draw_controller_1.AdminController],
        providers: [draw_day_service_1.DrawDayService],
        exports: [draw_day_service_1.DrawDayService],
    })
], DrawModule);
//# sourceMappingURL=draw.module.js.map