"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findNationalPendingDraw = findNationalPendingDraw;
exports.findNationalLastCompletedDraw = findNationalLastCompletedDraw;
exports.findNationalLatestCompletedUnarchivedDraw = findNationalLatestCompletedUnarchivedDraw;
exports.findShopPendingLocalDraw = findShopPendingLocalDraw;
exports.findShopLastCompletedLocalDraw = findShopLastCompletedLocalDraw;
async function findNationalPendingDraw(drawRepo) {
    return drawRepo
        .createQueryBuilder('d')
        .where('d.status = :s', { s: 'pending' })
        .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
        .andWhere('(d.shop_id IS NULL)')
        .orderBy('d.draw_id', 'DESC')
        .getOne();
}
async function findNationalLastCompletedDraw(drawRepo) {
    return drawRepo
        .createQueryBuilder('d')
        .where('d.status IN (:...st)', { st: ['completed', 'COMPLETED'] })
        .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
        .andWhere('(d.shop_id IS NULL)')
        .orderBy('d.draw_id', 'DESC')
        .getOne();
}
async function findNationalLatestCompletedUnarchivedDraw(drawRepo) {
    return drawRepo
        .createQueryBuilder('d')
        .where('d.status IN (:...st)', { st: ['completed', 'COMPLETED'] })
        .andWhere('(d.lottery_type = :lt OR d.lottery_type IS NULL)', { lt: 'NACIONAL' })
        .andWhere('(d.shop_id IS NULL)')
        .andWhere('d.archived_at IS NULL')
        .orderBy('d.draw_id', 'DESC')
        .getOne();
}
async function findShopPendingLocalDraw(drawRepo, shopId, lotteryType) {
    return drawRepo.findOne({
        where: {
            status: 'pending',
            shop_id: shopId,
            lottery_type: lotteryType,
        },
        order: { draw_id: 'DESC' },
    });
}
async function findShopLastCompletedLocalDraw(drawRepo, shopId, lotteryType) {
    return drawRepo
        .createQueryBuilder('d')
        .where('d.status IN (:...st)', { st: ['completed', 'COMPLETED'] })
        .andWhere('d.shop_id = :sid', { sid: shopId })
        .andWhere('d.lottery_type = :lt', { lt: lotteryType })
        .orderBy('d.draw_id', 'DESC')
        .getOne();
}
//# sourceMappingURL=draw-queries.js.map