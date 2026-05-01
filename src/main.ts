import Phaser from 'phaser';
import './style.css';

type ResourceState = { wood: number; stone: number; food: number; gold: number };
type BuildingKind = 'keep' | 'farm' | 'tower' | 'workshop' | 'barracks';
type EnemyKind = 'raider' | 'brute' | 'runner';

type BuildingModel = {
  id: string;
  kind: BuildingKind;
  sprite: Phaser.GameObjects.Rectangle;
  hp: number;
  maxHp: number;
  level: number;
  repairCost: number;
  generationRate: Partial<ResourceState>;
  attackRange?: number;
  attackDamage?: number;
  attackCooldown?: number;
  nextAttackAt?: number;
};

type EnemyModel = {
  kind: EnemyKind;
  sprite: Phaser.GameObjects.Rectangle;
  hp: number;
  speed: number;
  damage: number;
  reward: Partial<ResourceState>;
};

type SafeZone = {
  id: string;
  x: number;
  y: number;
  radius: number;
  circle: Phaser.GameObjects.Arc;
  ttl: number;
};

const WORLD_SIZE = 4600;
const PLAYER_SPEED = 160;

class MainScene extends Phaser.Scene {
  private readonly isMobile = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent);
  private player!: Phaser.GameObjects.Rectangle;
  private playerDirection = new Phaser.Math.Vector2(1, 0);
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private resources: ResourceState = { wood: 140, stone: 110, food: 120, gold: 30 };
  private buildings: BuildingModel[] = [];
  private enemies: EnemyModel[] = [];
  private projectiles: Phaser.GameObjects.Arc[] = [];
  private safeZones: SafeZone[] = [];
  private activeSafeZone: SafeZone | null = null;
  private pausedByMenu = false;
  private waves = 0;
  private waveText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private menuContainer!: Phaser.GameObjects.Container;
  private mobileStickBase!: Phaser.GameObjects.Circle;
  private mobileStickKnob!: Phaser.GameObjects.Circle;
  private joystickVector = new Phaser.Math.Vector2(0, 0);

  create(): void {
    this.createMapBackdrop();
    this.createPlayer();
    this.createInitialBuildings();
    this.createHud();
    this.createUpgradeMenu();
    this.createJoystick();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

    this.time.addEvent({ delay: 7000, loop: true, callback: this.spawnWave, callbackScope: this });
    this.time.addEvent({ delay: 11000, loop: true, callback: this.spawnSafeZone, callbackScope: this });
    this.time.addEvent({ delay: 2000, loop: true, callback: this.resourceTick, callbackScope: this });
  }

  update(_: number, delta: number): void {
    const dt = delta / 1000;

    if (!this.pausedByMenu) {
      this.updatePlayer(dt);
      this.handleBuildingPlacement();
      this.checkSafeZoneEntry();
    }

    const speedFactor = this.pausedByMenu ? 0.2 : 1;
    this.updateEnemies(dt * speedFactor);
    this.updateDefenseFire();
    this.updateSafeZones(dt);
    this.cleanup();
    this.updateHud();
  }

  private createMapBackdrop(): void {
    this.add.rectangle(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0x243526);
    for (let i = 0; i < 280; i += 1) {
      this.add.rectangle(
        Phaser.Math.Between(0, WORLD_SIZE),
        Phaser.Math.Between(0, WORLD_SIZE),
        Phaser.Math.Between(22, 58),
        Phaser.Math.Between(14, 36),
        Phaser.Math.Between(0, 1) ? 0x304830 : 0x3b4527,
        0.28
      );
    }
  }

  private createPlayer(): void {
    this.player = this.add.rectangle(2300, 2300, 20, 20, 0x7cd1ff).setStrokeStyle(2, 0x183f5a);
    this.keys = this.input.keyboard?.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  private createInitialBuildings(): void {
    this.addBuilding('keep', 2300, 2300, true);
    this.addBuilding('farm', 2410, 2310);
    this.addBuilding('tower', 2175, 2230);
    this.addBuilding('workshop', 2220, 2400);
  }

  private createHud(): void {
    this.hudText = this.add.text(16, 14, '', { color: '#f4f1ca', fontSize: '15px' }).setScrollFactor(0);
    this.waveText = this.add.text(16, 38, 'Wave: 0', { color: '#d2f0ff', fontSize: '14px' }).setScrollFactor(0);
    const controlHint = this.isMobile
      ? 'Mobile mode: drag joystick + tap near hero to place towers.'
      : 'Desktop mode: WASD steer + click near hero to place towers.';
    this.hintText = this.add
      .text(16, 62, `${controlHint} Safe zones = upgrades.`, {
        color: '#fff2b2',
        fontSize: '13px'
      })
      .setScrollFactor(0);
  }

  private createUpgradeMenu(): void {
    const bg = this.add.rectangle(400, 225, 520, 330, 0x141916, 0.95).setStrokeStyle(2, 0x80ab75);
    const title = this.add.text(198, 85, 'Refuge Event Menu', { color: '#c8f8bb', fontSize: '25px' });
    const sub = this.add.text(170, 120, 'Choose one event bonus, then leave or keep crafting.', { color: '#e8edda', fontSize: '13px' });
    const t1 = this.add.text(210, 165, '[1] Repair Keep (30 wood)', { color: '#ffe6b2', fontSize: '18px' });
    const t2 = this.add.text(210, 195, '[2] Upgrade Keep (+HP, +income) (50 stone, 30 food)', { color: '#d3f5ff', fontSize: '18px' });
    const t3 = this.add.text(210, 225, '[3] Build Barracks (55 wood, 40 stone)', { color: '#f8d5ff', fontSize: '18px' });
    const t4 = this.add.text(210, 255, '[4] Emergency Supplies (+30 food, +20 wood)', { color: '#c9fdd0', fontSize: '18px' });
    const exit = this.add.text(210, 287, '[ESC] Exit refuge menu', { color: '#bcccae', fontSize: '17px' });

    this.menuContainer = this.add.container(0, 0, [bg, title, sub, t1, t2, t3, t4, exit]).setScrollFactor(0).setVisible(false);

    this.input.keyboard?.on('keydown-ONE', () => this.repairKeep());
    this.input.keyboard?.on('keydown-TWO', () => this.upgradeKeep());
    this.input.keyboard?.on('keydown-THREE', () => this.buildBarracks());
    this.input.keyboard?.on('keydown-FOUR', () => this.emergencySupplies());
    this.input.keyboard?.on('keydown-ESC', () => this.closeMenu());
  }

  private createJoystick(): void {
    this.mobileStickBase = this.add.circle(88, 370, 44, 0x202734, 0.45).setScrollFactor(0).setDepth(20);
    this.mobileStickKnob = this.add.circle(88, 370, 18, 0x8ec8ff, 0.82).setScrollFactor(0).setDepth(21);
    if (!this.isMobile) {
      this.mobileStickBase.setVisible(false);
      this.mobileStickKnob.setVisible(false);
      return;
    }

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      const dx = pointer.x - 88;
      const dy = pointer.y - 370;
      const len = Math.min(36, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      this.mobileStickKnob.setPosition(88 + Math.cos(a) * len, 370 + Math.sin(a) * len);
      this.joystickVector.set(Math.cos(a) * (len / 36), Math.sin(a) * (len / 36));
    });
    this.input.on('pointerup', () => {
      this.mobileStickKnob.setPosition(88, 370);
      this.joystickVector.set(0, 0);
    });
  }

  private updatePlayer(dt: number): void {
    const input = new Phaser.Math.Vector2(0, 0);
    if (this.keys.W.isDown) input.y -= 1;
    if (this.keys.S.isDown) input.y += 1;
    if (this.keys.A.isDown) input.x -= 1;
    if (this.keys.D.isDown) input.x += 1;
    if (input.lengthSq() > 0) this.playerDirection.copy(input.normalize());
    else if (this.isMobile && this.joystickVector.lengthSq() > 0.03) this.playerDirection.copy(this.joystickVector.clone().normalize());

    const next = this.playerDirection.clone().scale(PLAYER_SPEED * dt);
    const nx = Phaser.Math.Clamp(this.player.x + next.x, 10, WORLD_SIZE - 10);
    const ny = Phaser.Math.Clamp(this.player.y + next.y, 10, WORLD_SIZE - 10);
    const blocked = this.buildings.some((b) => Phaser.Math.Distance.Between(nx, ny, b.sprite.x, b.sprite.y) < 20);
    if (!blocked) this.player.setPosition(nx, ny);
  }

  private spawnWave(): void {
    this.waves += 1;
    this.waveText.setText(`Wave: ${this.waves}`);
    const count = 3 + Math.floor(this.waves * 1.8);
    for (let i = 0; i < count; i += 1) this.spawnEnemyByWave();
  }

  private spawnEnemyByWave(): void {
    const roll = Phaser.Math.Between(1, 100);
    const kind: EnemyKind = roll < 60 ? 'raider' : roll < 85 ? 'runner' : 'brute';
    const stats = {
      raider: { hp: 38, speed: 68, damage: 8, color: 0x8f2a2a, reward: { wood: 5, food: 3, gold: 1 } },
      runner: { hp: 24, speed: 98, damage: 6, color: 0xaf5050, reward: { wood: 3, food: 5 } },
      brute: { hp: 78, speed: 48, damage: 16, color: 0x5f1b1b, reward: { stone: 7, gold: 3 } }
    }[kind];

    const p = Phaser.Math.Between(0, 3);
    const x = p === 0 ? 0 : p === 1 ? WORLD_SIZE : Phaser.Math.Between(0, WORLD_SIZE);
    const y = p === 2 ? 0 : p === 3 ? WORLD_SIZE : Phaser.Math.Between(0, WORLD_SIZE);
    const sprite = this.add.rectangle(x, y, 16, 16, stats.color).setStrokeStyle(1, 0xdca6a6);

    this.enemies.push({ kind, sprite, hp: stats.hp + this.waves * 2, speed: stats.speed, damage: stats.damage, reward: stats.reward });
  }

  private updateEnemies(dt: number): void {
    this.enemies.forEach((enemy) => {
      const targetBuilding = this.getClosestLivingBuilding(enemy.sprite.x, enemy.sprite.y);
      const target = targetBuilding?.sprite ?? this.player;
      const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, target.x, target.y);
      enemy.sprite.x += Math.cos(angle) * enemy.speed * dt;
      enemy.sprite.y += Math.sin(angle) * enemy.speed * dt;

      if (targetBuilding && Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, target.x, target.y) < 16) {
        targetBuilding.hp -= enemy.damage * dt * (1 + this.waves * 0.04);
      } else if (Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.x, this.player.y) < 14) {
        this.resources.food = Math.max(0, this.resources.food - 6 * dt);
      }

      if (Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.x, this.player.y) < 24) {
        enemy.hp -= 48 * dt;
      }
    });

    this.buildings = this.buildings.filter((b) => {
      if (b.hp > 0) return true;
      b.sprite.destroy();
      if (b.kind === 'keep') this.triggerGameOver();
      return false;
    });
  }

  private updateDefenseFire(): void {
    const now = this.time.now;
    this.buildings.forEach((building) => {
      if (building.kind !== 'tower' || !building.attackRange || !building.attackCooldown || !building.attackDamage) return;
      if ((building.nextAttackAt ?? 0) > now) return;
      const target = this.enemies.find((e) => Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, building.sprite.x, building.sprite.y) <= building.attackRange!);
      if (!target) return;
      building.nextAttackAt = now + building.attackCooldown;
      target.hp -= building.attackDamage;
      const p = this.add.circle(building.sprite.x, building.sprite.y, 3, 0xf5f2b6, 0.9);
      this.tweens.add({ targets: p, x: target.sprite.x, y: target.sprite.y, duration: 120, onComplete: () => p.destroy() });
      this.projectiles.push(p);
    });

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.hp > 0 && enemy.sprite.active) return true;
      enemy.sprite.destroy();
      this.resources.wood += enemy.reward.wood ?? 0;
      this.resources.stone += enemy.reward.stone ?? 0;
      this.resources.food += enemy.reward.food ?? 0;
      this.resources.gold += enemy.reward.gold ?? 0;
      return false;
    });
  }

  private resourceTick(): void {
    this.buildings.forEach((b) => {
      this.resources.wood += b.generationRate.wood ?? 0;
      this.resources.stone += b.generationRate.stone ?? 0;
      this.resources.food += b.generationRate.food ?? 0;
      this.resources.gold += b.generationRate.gold ?? 0;
    });
  }

  private addBuilding(kind: BuildingKind, x: number, y: number, isCentral = false): void {
    const palette: Record<BuildingKind, number> = { keep: 0xbcb075, farm: 0x6da050, tower: 0x8f8481, workshop: 0x7b8aac, barracks: 0x956d5f };
    const size = kind === 'keep' ? 40 : 26;
    const sprite = this.add.rectangle(Phaser.Math.Clamp(x, 28, WORLD_SIZE - 28), Phaser.Math.Clamp(y, 28, WORLD_SIZE - 28), size, size, palette[kind]).setStrokeStyle(2, 0x101010);

    const model: BuildingModel = {
      id: `${kind}-${Date.now()}-${Math.floor(Math.random() * 9000)}`,
      kind,
      sprite,
      hp: isCentral ? 420 : 180,
      maxHp: isCentral ? 420 : 180,
      level: 1,
      repairCost: isCentral ? 30 : 20,
      generationRate:
        kind === 'farm' ? { food: 2 } : kind === 'workshop' ? { stone: 1, gold: 1 } : kind === 'barracks' ? { wood: 1, food: 1 } : kind === 'keep' ? { wood: 2, stone: 1 } : { stone: 1 },
      attackRange: kind === 'tower' ? 180 : undefined,
      attackDamage: kind === 'tower' ? 15 : undefined,
      attackCooldown: kind === 'tower' ? 850 : undefined,
      nextAttackAt: 0
    };
    this.buildings.push(model);
  }

  private spawnSafeZone(): void {
    const zone: SafeZone = {
      id: `zone-${Date.now()}`,
      x: Phaser.Math.Between(120, WORLD_SIZE - 120),
      y: Phaser.Math.Between(120, WORLD_SIZE - 120),
      radius: Phaser.Math.Between(74, 120),
      circle: this.add.circle(0, 0, 10, 0x80ca91, 0.2),
      ttl: 22
    };
    zone.circle.destroy();
    zone.circle = this.add.circle(zone.x, zone.y, zone.radius, 0x80ca91, 0.2).setStrokeStyle(2, 0x93f0a8, 0.45);
    this.safeZones.push(zone);
  }

  private updateSafeZones(dt: number): void {
    this.safeZones.forEach((z) => (z.ttl -= dt));
    this.safeZones = this.safeZones.filter((z) => {
      if (z.ttl > 0) return true;
      z.circle.destroy();
      return false;
    });
  }

  private checkSafeZoneEntry(): void {
    if (this.pausedByMenu) return;
    const matched = this.safeZones.find((z) => Phaser.Math.Distance.Between(this.player.x, this.player.y, z.x, z.y) <= z.radius);
    if (matched && this.activeSafeZone?.id !== matched.id) {
      this.activeSafeZone = matched;
      this.openMenu();
    }
  }

  private handleBuildingPlacement(): void {
    if (!this.input.activePointer.justDown) return;
    const world = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, world.x, world.y) > 210) return;
    if (this.resources.wood < 40 || this.resources.stone < 30) return;
    const overlapping = this.buildings.some((b) => Phaser.Math.Distance.Between(b.sprite.x, b.sprite.y, world.x, world.y) < 46);
    if (overlapping) return;
    this.resources.wood -= 40;
    this.resources.stone -= 30;
    this.addBuilding('tower', world.x, world.y);
  }

  private openMenu(): void {
    this.pausedByMenu = true;
    this.menuContainer.setVisible(true);
    if (this.isMobile) {
      this.hintText.setText('Mobile menu: use number keys if keyboard attached, or ESC/back to exit.');
    }
  }

  private closeMenu(): void {
    this.pausedByMenu = false;
    this.activeSafeZone = null;
    this.menuContainer.setVisible(false);
  }

  private repairKeep(): void {
    if (!this.pausedByMenu) return;
    const keep = this.getKeep();
    if (!keep || this.resources.wood < keep.repairCost || keep.hp >= keep.maxHp) return;
    this.resources.wood -= keep.repairCost;
    keep.hp = Math.min(keep.maxHp, keep.hp + 80);
  }

  private upgradeKeep(): void {
    if (!this.pausedByMenu) return;
    const keep = this.getKeep();
    if (!keep || this.resources.stone < 50 || this.resources.food < 30) return;
    this.resources.stone -= 50;
    this.resources.food -= 30;
    keep.level += 1;
    keep.maxHp += 60;
    keep.hp = keep.maxHp;
    keep.generationRate.wood = (keep.generationRate.wood ?? 0) + 1;
    keep.sprite.setFillStyle(0xc9d588 + keep.level * 0x050200);
  }

  private buildBarracks(): void {
    if (!this.pausedByMenu || this.resources.wood < 55 || this.resources.stone < 40) return;
    this.resources.wood -= 55;
    this.resources.stone -= 40;
    this.addBuilding('barracks', this.player.x + Phaser.Math.Between(-120, 120), this.player.y + Phaser.Math.Between(-120, 120));
  }

  private emergencySupplies(): void {
    if (!this.pausedByMenu || this.resources.gold < 10) return;
    this.resources.gold -= 10;
    this.resources.food += 30;
    this.resources.wood += 20;
  }

  private updateHud(): void {
    const keep = this.getKeep();
    const keepHp = keep ? `${Math.max(0, keep.hp).toFixed(0)}/${keep.maxHp}` : '0';
    this.hudText.setText(`W ${this.resources.wood.toFixed(0)}  S ${this.resources.stone.toFixed(0)}  F ${this.resources.food.toFixed(0)}  G ${this.resources.gold.toFixed(0)}  Keep ${keepHp}`);
  }

  private getClosestLivingBuilding(x: number, y: number): BuildingModel | null {
    let best: BuildingModel | null = null;
    let dist = Number.POSITIVE_INFINITY;
    this.buildings.forEach((b) => {
      const d = Phaser.Math.Distance.Between(x, y, b.sprite.x, b.sprite.y);
      if (d < dist) {
        dist = d;
        best = b;
      }
    });
    return best;
  }

  private getKeep(): BuildingModel | undefined {
    return this.buildings.find((b) => b.kind === 'keep');
  }

  private triggerGameOver(): void {
    this.scene.pause();
    this.add
      .text(this.cameras.main.midPoint.x - 185, this.cameras.main.midPoint.y, 'Keep destroyed. Campaign failed.', { fontSize: '34px', color: '#ffbbbb' })
      .setScrollFactor(0)
      .setDepth(40)
      .setStroke('#230f0f', 3);
  }

  private cleanup(): void {
    this.projectiles = this.projectiles.filter((p) => p.active);
    this.enemies = this.enemies.filter((e) => e.sprite.active);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1e221a',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 450 },
  scene: [MainScene]
};

new Phaser.Game(config);

// Copyright and licensed usage to Joe Wease, Founder and CEO of REALE.
