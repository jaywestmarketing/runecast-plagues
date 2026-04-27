import Phaser from 'phaser';
import './style.css';

type ResourceState = {
  wood: number;
  stone: number;
  food: number;
};

type BuildingKind = 'keep' | 'farm' | 'tower' | 'barracks';

type BuildingModel = {
  id: string;
  kind: BuildingKind;
  sprite: Phaser.GameObjects.Rectangle;
  hp: number;
  maxHp: number;
  level: number;
  repairCost: number;
  generationRate: Partial<ResourceState>;
};

type SafeZone = {
  id: string;
  x: number;
  y: number;
  radius: number;
  circle: Phaser.GameObjects.Arc;
};

const WORLD_SIZE = 4200;
const PLAYER_SPEED = 150;
const ENEMY_SPEED = 64;

class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;

  private playerDirection = new Phaser.Math.Vector2(1, 0);

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private resources: ResourceState = { wood: 130, stone: 90, food: 110 };

  private buildings: BuildingModel[] = [];

  private enemies: Phaser.GameObjects.Rectangle[] = [];

  private safeZones: SafeZone[] = [];

  private activeSafeZone: SafeZone | null = null;

  private pausedByMenu = false;

  private waves = 0;

  private waveText!: Phaser.GameObjects.Text;

  private hudText!: Phaser.GameObjects.Text;

  private menuContainer!: Phaser.GameObjects.Container;

  private menuBg!: Phaser.GameObjects.Rectangle;

  private mobileStickBase!: Phaser.GameObjects.Circle;

  private mobileStickKnob!: Phaser.GameObjects.Circle;

  private joystickVector = new Phaser.Math.Vector2(0, 0);

  constructor() {
    super('main');
  }

  create(): void {
    this.createMapBackdrop();
    this.createPlayer();
    this.createInitialBuildings();
    this.createHud();
    this.createUpgradeMenu();
    this.createJoystick();

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

    this.time.addEvent({
      delay: 6000,
      loop: true,
      callback: this.spawnWave,
      callbackScope: this
    });

    this.time.addEvent({
      delay: 10000,
      loop: true,
      callback: this.spawnSafeZone,
      callbackScope: this
    });

    this.time.addEvent({
      delay: 2200,
      loop: true,
      callback: this.resourceTick,
      callbackScope: this
    });
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;

    if (!this.pausedByMenu) {
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.checkSafeZoneEntry();
      this.handleBuildingPlacement();
    }

    const speedFactor = this.pausedByMenu ? 0.16 : 1;
    this.updateEnemies(dt * speedFactor);
    this.updateHud();

    if (time % 250 < 16) {
      this.cleanupDeadEnemies();
    }
  }

  private createMapBackdrop(): void {
    this.add.rectangle(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0x263d26);

    for (let i = 0; i < 240; i += 1) {
      const x = Phaser.Math.Between(0, WORLD_SIZE);
      const y = Phaser.Math.Between(0, WORLD_SIZE);
      const color = Phaser.Math.Between(0, 1) ? 0x304830 : 0x2f3f25;
      this.add.rectangle(x, y, Phaser.Math.Between(28, 60), Phaser.Math.Between(18, 40), color, 0.35);
    }
  }

  private createPlayer(): void {
    this.player = this.add.rectangle(2100, 2100, 20, 20, 0x66ccff);
    this.player.setStrokeStyle(2, 0x183f5a);
    this.keys = this.input.keyboard?.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  private createInitialBuildings(): void {
    this.addBuilding('keep', 2100, 2100, true);
    this.addBuilding('farm', 2200, 2140);
    this.addBuilding('tower', 1970, 2050);
  }

  private createHud(): void {
    this.hudText = this.add.text(18, 14, '', {
      color: '#f1f3c3',
      fontSize: '16px'
    });
    this.hudText.setScrollFactor(0);

    this.waveText = this.add.text(18, 42, 'Wave: 0', {
      color: '#d2f0ff',
      fontSize: '15px'
    });
    this.waveText.setScrollFactor(0);

    const hint = this.add.text(18, 68, 'Click empty ground near you to place tower (wood 40, stone 25).', {
      color: '#fff2b2',
      fontSize: '13px',
      wordWrap: { width: 440 }
    });
    hint.setScrollFactor(0);
  }

  private createUpgradeMenu(): void {
    this.menuBg = this.add.rectangle(400, 225, 460, 310, 0x121515, 0.92);
    this.menuBg.setStrokeStyle(2, 0x7f9d70);

    const title = this.add.text(220, 95, 'Safe Zone Menu', { color: '#c6f4be', fontSize: '24px' });
    const subtitle = this.add.text(210, 132, 'Repair, upgrade, and recruit while pressure slows.', {
      color: '#e8edda',
      fontSize: '13px'
    });

    const repair = this.add.text(240, 172, '[R] Repair Keep (30 wood)', {
      color: '#ffe6b2',
      fontSize: '18px'
    });
    const upgrade = this.add.text(240, 206, '[U] Upgrade Keep (45 stone + 30 food)', {
      color: '#d3f5ff',
      fontSize: '18px'
    });
    const recruit = this.add.text(240, 240, '[B] Build Barracks (50 wood + 40 stone)', {
      color: '#f8d5ff',
      fontSize: '18px'
    });
    const close = this.add.text(240, 280, '[ESC] Leave Safe Zone Menu', {
      color: '#bcccae',
      fontSize: '17px'
    });

    this.menuContainer = this.add.container(0, 0, [this.menuBg, title, subtitle, repair, upgrade, recruit, close]);
    this.menuContainer.setScrollFactor(0);
    this.menuContainer.setVisible(false);

    this.input.keyboard?.on('keydown-R', () => {
      if (!this.pausedByMenu) return;
      const keep = this.getKeep();
      if (keep && this.resources.wood >= keep.repairCost && keep.hp < keep.maxHp) {
        this.resources.wood -= keep.repairCost;
        keep.hp = Math.min(keep.maxHp, keep.hp + 65);
      }
    });

    this.input.keyboard?.on('keydown-U', () => {
      if (!this.pausedByMenu) return;
      const keep = this.getKeep();
      if (keep && this.resources.stone >= 45 && this.resources.food >= 30) {
        this.resources.stone -= 45;
        this.resources.food -= 30;
        keep.level += 1;
        keep.maxHp += 50;
        keep.hp = keep.maxHp;
        keep.repairCost += 5;
        keep.sprite.setFillStyle(0xcad489 + keep.level * 0x070300);
      }
    });

    this.input.keyboard?.on('keydown-B', () => {
      if (!this.pausedByMenu) return;
      if (this.resources.wood < 50 || this.resources.stone < 40) return;
      this.resources.wood -= 50;
      this.resources.stone -= 40;
      this.addBuilding(
        'barracks',
        this.player.x + Phaser.Math.Between(-130, 130),
        this.player.y + Phaser.Math.Between(-130, 130)
      );
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      this.closeMenu();
    });
  }

  private createJoystick(): void {
    this.mobileStickBase = this.add.circle(88, 370, 44, 0x202734, 0.45);
    this.mobileStickKnob = this.add.circle(88, 370, 18, 0x8ec8ff, 0.8);
    this.mobileStickBase.setScrollFactor(0).setDepth(20);
    this.mobileStickKnob.setScrollFactor(0).setDepth(21);

    this.mobileStickBase.setInteractive();
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      const dx = pointer.x - 88;
      const dy = pointer.y - 370;
      const length = Math.min(36, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      this.mobileStickKnob.x = 88 + Math.cos(angle) * length;
      this.mobileStickKnob.y = 370 + Math.sin(angle) * length;
      this.joystickVector.set(Math.cos(angle) * (length / 36), Math.sin(angle) * (length / 36));
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

    if (input.lengthSq() > 0.02) {
      input.normalize();
      this.playerDirection.copy(input);
    } else if (this.joystickVector.lengthSq() > 0.03) {
      this.playerDirection.copy(this.joystickVector.clone().normalize());
    }

    const velocity = this.playerDirection.clone().scale(PLAYER_SPEED * dt);
    const nextX = Phaser.Math.Clamp(this.player.x + velocity.x, 10, WORLD_SIZE - 10);
    const nextY = Phaser.Math.Clamp(this.player.y + velocity.y, 10, WORLD_SIZE - 10);

    const blocked = this.buildings.some((building) => {
      const distance = Phaser.Math.Distance.Between(nextX, nextY, building.sprite.x, building.sprite.y);
      return distance < 20;
    });

    if (!blocked) {
      this.player.setPosition(nextX, nextY);
    }
  }

  private spawnWave(): void {
    this.waves += 1;
    this.waveText.setText(`Wave: ${this.waves}`);

    const enemiesThisWave = 3 + Math.floor(this.waves * 1.5);
    for (let i = 0; i < enemiesThisWave; i += 1) {
      const edge = Phaser.Math.Between(0, 3);
      let x = 0;
      let y = 0;
      if (edge === 0) {
        x = 0;
        y = Phaser.Math.Between(0, WORLD_SIZE);
      } else if (edge === 1) {
        x = WORLD_SIZE;
        y = Phaser.Math.Between(0, WORLD_SIZE);
      } else if (edge === 2) {
        x = Phaser.Math.Between(0, WORLD_SIZE);
        y = 0;
      } else {
        x = Phaser.Math.Between(0, WORLD_SIZE);
        y = WORLD_SIZE;
      }

      const enemy = this.add.rectangle(x, y, 16, 16, 0x7f1c1c);
      enemy.setStrokeStyle(1, 0xd26f6f);
      this.enemies.push(enemy);
    }
  }

  private updateEnemies(dt: number): void {
    this.enemies.forEach((enemy) => {
      const targetBuilding = this.getClosestLivingBuilding(enemy.x, enemy.y);
      const target = targetBuilding?.sprite ?? this.player;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);

      enemy.x += Math.cos(angle) * ENEMY_SPEED * dt;
      enemy.y += Math.sin(angle) * ENEMY_SPEED * dt;

      if (targetBuilding && Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y) < 15) {
        targetBuilding.hp -= 7 * dt * (1 + this.waves * 0.06);
      } else if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) < 13) {
        this.resources.food = Math.max(0, this.resources.food - 5 * dt);
      }

      const strikeRange = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) < 24;
      if (strikeRange) {
        enemy.destroy();
        this.resources.wood += 7;
        this.resources.stone += 3;
      }
    });

    this.buildings = this.buildings.filter((building) => {
      if (building.hp <= 0) {
        building.sprite.destroy();
        if (building.kind === 'keep') {
          this.scene.pause();
          const lost = this.add
            .text(this.cameras.main.midPoint.x - 160, this.cameras.main.midPoint.y, 'Your keep fell. Run ended.', {
              fontSize: '34px',
              color: '#ffbbbb'
            })
            .setScrollFactor(0)
            .setDepth(40);
          lost.setStroke('#230f0f', 3);
        }
        return false;
      }
      return true;
    });
  }

  private getClosestLivingBuilding(x: number, y: number): BuildingModel | null {
    let closest: BuildingModel | null = null;
    let best = Number.POSITIVE_INFINITY;
    this.buildings.forEach((building) => {
      const d = Phaser.Math.Distance.Between(x, y, building.sprite.x, building.sprite.y);
      if (d < best) {
        best = d;
        closest = building;
      }
    });
    return closest;
  }

  private resourceTick(): void {
    this.buildings.forEach((building) => {
      const gen = building.generationRate;
      this.resources.wood += gen.wood ?? 0;
      this.resources.stone += gen.stone ?? 0;
      this.resources.food += gen.food ?? 0;
    });
  }

  private addBuilding(kind: BuildingKind, x: number, y: number, isCentral = false): void {
    const palette: Record<BuildingKind, number> = {
      keep: 0xbcb075,
      farm: 0x70a14b,
      tower: 0x9b8d89,
      barracks: 0x956d5f
    };
    const size = kind === 'keep' ? 38 : 26;

    const sprite = this.add.rectangle(
      Phaser.Math.Clamp(x, 28, WORLD_SIZE - 28),
      Phaser.Math.Clamp(y, 28, WORLD_SIZE - 28),
      size,
      size,
      palette[kind]
    );
    sprite.setStrokeStyle(2, 0x101010);

    const model: BuildingModel = {
      id: `${kind}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      kind,
      sprite,
      hp: isCentral ? 380 : 180,
      maxHp: isCentral ? 380 : 180,
      level: 1,
      repairCost: isCentral ? 30 : 20,
      generationRate:
        kind === 'farm'
          ? { food: 2 }
          : kind === 'tower'
            ? { stone: 1 }
            : kind === 'barracks'
              ? { wood: 1, food: 1 }
              : { wood: 2, stone: 1 }
    };

    this.buildings.push(model);
  }

  private spawnSafeZone(): void {
    const zone: SafeZone = {
      id: `zone-${Date.now()}`,
      x: Phaser.Math.Between(100, WORLD_SIZE - 100),
      y: Phaser.Math.Between(100, WORLD_SIZE - 100),
      radius: Phaser.Math.Between(70, 115),
      circle: this.add.circle(0, 0, 20, 0x80ca91, 0.15)
    };

    zone.circle.destroy();
    zone.circle = this.add.circle(zone.x, zone.y, zone.radius, 0x80ca91, 0.18);
    zone.circle.setStrokeStyle(2, 0x93f0a8, 0.45);

    this.safeZones.push(zone);
    if (this.safeZones.length > 4) {
      const old = this.safeZones.shift();
      old?.circle.destroy();
    }
  }

  private checkSafeZoneEntry(): void {
    if (this.pausedByMenu) return;

    const matched = this.safeZones.find(
      (zone) => Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.x, zone.y) <= zone.radius
    );

    if (matched && this.activeSafeZone?.id !== matched.id) {
      this.activeSafeZone = matched;
      this.openMenu();
    }
  }

  private openMenu(): void {
    this.pausedByMenu = true;
    this.menuContainer.setVisible(true);
  }

  private closeMenu(): void {
    this.pausedByMenu = false;
    this.activeSafeZone = null;
    this.menuContainer.setVisible(false);
  }

  private handleBuildingPlacement(): void {
    if (!this.input.activePointer.justDown) return;
    const pointer = this.input.activePointer;
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;

    const farFromPlayer = Phaser.Math.Distance.Between(this.player.x, this.player.y, world.x, world.y) > 210;
    if (farFromPlayer) return;

    if (this.resources.wood < 40 || this.resources.stone < 25) return;

    const overlapping = this.buildings.some(
      (building) => Phaser.Math.Distance.Between(building.sprite.x, building.sprite.y, world.x, world.y) < 44
    );

    if (!overlapping) {
      this.resources.wood -= 40;
      this.resources.stone -= 25;
      this.addBuilding('tower', world.x, world.y);
    }
  }

  private updateHud(): void {
    const keep = this.getKeep();
    const keepHp = keep ? `${Math.max(0, keep.hp).toFixed(0)}/${keep.maxHp}` : '0';
    this.hudText.setText(
      `Wood ${this.resources.wood.toFixed(0)}   Stone ${this.resources.stone.toFixed(0)}   Food ${this.resources.food.toFixed(0)}   Keep HP ${keepHp}`
    );
  }

  private getKeep(): BuildingModel | undefined {
    return this.buildings.find((b) => b.kind === 'keep');
  }

  private cleanupDeadEnemies(): void {
    this.enemies = this.enemies.filter((enemy) => enemy.active);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1e221a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 450
  },
  scene: [MainScene]
};

new Phaser.Game(config);

// Copyright and licensed usage to Joe Wease, Founder and CEO of REALE.
