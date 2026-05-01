import Phaser from 'phaser';
import './style.css';

type ResourceState = { wood: number; stone: number; food: number; gold: number };
type BuildingKind = 'keep' | 'house' | 'tower' | 'workshop';
type ViewMode = 'third' | 'first';

type BuildingModel = {
  id: string;
  kind: BuildingKind;
  sprite: Phaser.GameObjects.Rectangle;
  hp: number;
  maxHp: number;
  level: number;
  generationRate: Partial<ResourceState>;
  attackLevel: number;
  defenseLevel: number;
  underAttackUntil: number;
};

type EnemyModel = { sprite: Phaser.GameObjects.Rectangle; hp: number; speed: number; damage: number };

const WORLD_SIZE = 9000;
const PLAYER_SPEED = 175;

class MainScene extends Phaser.Scene {
  private readonly isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  private player!: Phaser.GameObjects.Rectangle;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private direction = new Phaser.Math.Vector2(1, 0);
  private viewMode: ViewMode = 'third';
  private resources: ResourceState = { wood: 220, stone: 160, food: 150, gold: 45 };
  private buildings: BuildingModel[] = [];
  private enemies: EnemyModel[] = [];
  private hudText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private joystickBase!: Phaser.GameObjects.Arc;
  private joystickKnob!: Phaser.GameObjects.Arc;
  private joystick = new Phaser.Math.Vector2(0, 0);
  private minimapDots: Phaser.GameObjects.Arc[] = [];
  private interiorOverlay!: Phaser.GameObjects.Container;
  private insideBuildingId: string | null = null;
  private waves = 0;
  private pointerWasDown = false;

  create(): void {
    this.makeWorld();
    this.createPlayer();
    this.createBuildings();
    this.createHud();
    this.createMinimap();
    this.createInteriorOverlay();
    this.createJoystick();
    this.bindHotkeys();

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.applyViewMode();

    this.time.addEvent({ delay: 6500, loop: true, callback: this.spawnWave, callbackScope: this });
    this.time.addEvent({ delay: 1800, loop: true, callback: this.resourceTick, callbackScope: this });
  }

  update(_: number, delta: number): void {
    const dt = delta / 1000;
    if (!this.insideBuildingId) {
      this.updatePlayer(dt);
      this.handlePlacement();
      this.tryEnterBuilding();
    }
    this.updateEnemies(dt);
    this.updateMinimap();
    this.updateHud();
    this.pointerWasDown = this.input.activePointer.isDown;
  }

  private makeWorld(): void {
    this.add.rectangle(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0x1f2a22);
    for (let i = 0; i < 600; i += 1) {
      this.add.rectangle(Phaser.Math.Between(0, WORLD_SIZE), Phaser.Math.Between(0, WORLD_SIZE), Phaser.Math.Between(18, 56), Phaser.Math.Between(14, 34), Phaser.Math.Between(0, 1) ? 0x3b204f : 0x263f2a, 0.26);
    }
  }

  private createPlayer(): void {
    this.player = this.add.rectangle(4500, 4500, 20, 20, 0xa8d9ff).setStrokeStyle(2, 0x1d4563);
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,E,Q,ONE,TWO') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  private createBuildings(): void {
    this.addBuilding('keep', 4500, 4500, 500);
    for (let i = 0; i < 24; i += 1) {
      this.addBuilding('house', 4500 + Phaser.Math.Between(-1800, 1800), 4500 + Phaser.Math.Between(-1800, 1800), 230);
    }
    this.addBuilding('tower', 4700, 4400, 260);
    this.addBuilding('workshop', 4350, 4620, 260);
  }

  private addBuilding(kind: BuildingKind, x: number, y: number, hp: number): void {
    const color: Record<BuildingKind, number> = { keep: 0x9f87cc, house: 0x7663a3, tower: 0x4f8aa8, workshop: 0x5d6f86 };
    const size = kind === 'keep' ? 42 : 26;
    const sprite = this.add.rectangle(x, y, size, size, color[kind], 0.95).setStrokeStyle(2, 0x130d20);
    this.buildings.push({
      id: `${kind}-${Date.now()}-${Math.random()}`,
      kind,
      sprite,
      hp,
      maxHp: hp,
      level: 1,
      generationRate: kind === 'house' ? { food: 1 } : kind === 'workshop' ? { stone: 1, gold: 1 } : { wood: 1 },
      attackLevel: kind === 'tower' ? 1 : 0,
      defenseLevel: 1,
      underAttackUntil: 0
    });
  }

  private createHud(): void {
    this.hudText = this.add.text(16, 12, '', { color: '#efe8ff', fontSize: '14px' }).setScrollFactor(0);
    this.waveText = this.add.text(16, 34, 'Wave: 0', { color: '#d2f0ff', fontSize: '14px' }).setScrollFactor(0);
    const help = this.isMobile
      ? 'Mobile: joystick moves. Tap near hero to place tower. Tap house to enter.'
      : 'Desktop: WASD move, 1=third person, 2=first person, E=enter/exit house.';
    this.add.text(16, 56, help, { color: '#ffedbb', fontSize: '13px' }).setScrollFactor(0);
  }

  private createMinimap(): void {
    this.add.rectangle(690, 98, 200, 170, 0x080b14, 0.72).setStrokeStyle(1, 0xc3d1ff, 0.6).setScrollFactor(0);
  }

  private createInteriorOverlay(): void {
    const bg = this.add.rectangle(400, 225, 800, 450, 0x121318, 0.92);
    const text = this.add.text(
      120,
      120,
      `INSIDE HOUSE

- Upgrade defense: Q (cost wood 25, stone 20)
- Upgrade attack: E (cost wood 20, gold 15)
- Exit: E near doorway

Houses under attack flash red on minimap.`,
      { color: '#e8efff', fontSize: '24px' }
    );
    this.interiorOverlay = this.add.container(0, 0, [bg, text]).setVisible(false).setScrollFactor(0).setDepth(100);
  }

  private createJoystick(): void {
    this.joystickBase = this.add.circle(86, 368, 42, 0x263044, 0.5).setScrollFactor(0).setDepth(20);
    this.joystickKnob = this.add.circle(86, 368, 17, 0x9ed8ff, 0.85).setScrollFactor(0).setDepth(21);
    if (!this.isMobile) {
      this.joystickBase.setVisible(false);
      this.joystickKnob.setVisible(false);
      return;
    }
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const dx = p.x - 86;
      const dy = p.y - 368;
      const len = Math.min(34, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      this.joystickKnob.setPosition(86 + Math.cos(a) * len, 368 + Math.sin(a) * len);
      this.joystick.set(Math.cos(a) * (len / 34), Math.sin(a) * (len / 34));
    });
    this.input.on('pointerup', () => {
      this.joystickKnob.setPosition(86, 368);
      this.joystick.set(0, 0);
    });
  }

  private bindHotkeys(): void {
    this.input.keyboard?.on('keydown-ONE', () => {
      this.viewMode = 'third';
      this.applyViewMode();
    });
    this.input.keyboard?.on('keydown-TWO', () => {
      this.viewMode = 'first';
      this.applyViewMode();
    });
    this.input.keyboard?.on('keydown-E', () => {
      if (this.insideBuildingId) this.exitHouse();
    });
    this.input.keyboard?.on('keydown-Q', () => {
      if (!this.insideBuildingId) return;
      const b = this.buildings.find((x) => x.id === this.insideBuildingId);
      if (!b || this.resources.wood < 25 || this.resources.stone < 20) return;
      this.resources.wood -= 25;
      this.resources.stone -= 20;
      b.defenseLevel += 1;
      b.maxHp += 40;
      b.hp = Math.min(b.maxHp, b.hp + 40);
    });
    this.input.keyboard?.on('keydown-E', () => {
      if (!this.insideBuildingId) return;
      const b = this.buildings.find((x) => x.id === this.insideBuildingId);
      if (!b || this.resources.wood < 20 || this.resources.gold < 15) return;
      this.resources.wood -= 20;
      this.resources.gold -= 15;
      b.attackLevel += 1;
    });
  }

  private applyViewMode(): void {
    this.cameras.main.setZoom(this.viewMode === 'first' ? 1.35 : 0.78);
  }

  private updatePlayer(dt: number): void {
    const input = new Phaser.Math.Vector2(0, 0);
    if (this.keys.W.isDown) input.y -= 1;
    if (this.keys.S.isDown) input.y += 1;
    if (this.keys.A.isDown) input.x -= 1;
    if (this.keys.D.isDown) input.x += 1;
    if (input.lengthSq() > 0) this.direction.copy(input.normalize());
    else if (this.isMobile && this.joystick.lengthSq() > 0.02) this.direction.copy(this.joystick.clone().normalize());
    const v = this.direction.clone().scale(PLAYER_SPEED * dt);
    this.player.x = Phaser.Math.Clamp(this.player.x + v.x, 10, WORLD_SIZE - 10);
    this.player.y = Phaser.Math.Clamp(this.player.y + v.y, 10, WORLD_SIZE - 10);
  }

  private spawnWave(): void {
    this.waves += 1;
    this.waveText.setText(`Wave: ${this.waves}`);
    const count = 6 + this.waves * 2;
    for (let i = 0; i < count; i += 1) {
      const edge = Phaser.Math.Between(0, 3);
      const x = edge === 0 ? 0 : edge === 1 ? WORLD_SIZE : Phaser.Math.Between(0, WORLD_SIZE);
      const y = edge === 2 ? 0 : edge === 3 ? WORLD_SIZE : Phaser.Math.Between(0, WORLD_SIZE);
      const sprite = this.add.rectangle(x, y, 14, 14, 0xd34f77).setStrokeStyle(1, 0x4f1330);
      this.enemies.push({ sprite, hp: 40 + this.waves * 3, speed: 56 + this.waves, damage: 8 + this.waves * 0.5 });
    }
  }

  private updateEnemies(dt: number): void {
    const now = this.time.now;
    this.enemies.forEach((enemy) => {
      const target = this.closestBuilding(enemy.sprite.x, enemy.sprite.y);
      const tx = target?.sprite.x ?? this.player.x;
      const ty = target?.sprite.y ?? this.player.y;
      const a = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, tx, ty);
      enemy.sprite.x += Math.cos(a) * enemy.speed * dt;
      enemy.sprite.y += Math.sin(a) * enemy.speed * dt;
      if (target && Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, target.sprite.x, target.sprite.y) < 16) {
        target.underAttackUntil = now + 900;
        target.hp -= enemy.damage * dt / target.defenseLevel;
      }
      if (Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.x, this.player.y) < 24) enemy.hp -= 58 * dt;
    });

    this.buildings.forEach((b) => {
      if (b.kind !== 'tower' || b.attackLevel < 1) return;
      const foe = this.enemies.find((e) => Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, b.sprite.x, b.sprite.y) < 180);
      if (!foe) return;
      foe.hp -= (8 + b.attackLevel * 4) * dt;
    });

    this.enemies = this.enemies.filter((e) => {
      if (e.hp > 0) return true;
      e.sprite.destroy();
      this.resources.wood += 2;
      this.resources.food += 1;
      return false;
    });

    this.buildings = this.buildings.filter((b) => {
      if (b.hp > 0) return true;
      b.sprite.destroy();
      return b.kind === 'keep' ? (this.gameOver(), false) : false;
    });
  }

  private tryEnterBuilding(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.keys.E)) return;
    const house = this.buildings.find((b) => b.kind === 'house' && Phaser.Math.Distance.Between(b.sprite.x, b.sprite.y, this.player.x, this.player.y) < 40);
    if (!house) return;
    this.insideBuildingId = house.id;
    this.interiorOverlay.setVisible(true);
  }

  private exitHouse(): void {
    this.insideBuildingId = null;
    this.interiorOverlay.setVisible(false);
  }

  private handlePlacement(): void {
    if (!(this.input.activePointer.isDown && !this.pointerWasDown)) return;
    const pos = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    if (Phaser.Math.Distance.Between(pos.x, pos.y, this.player.x, this.player.y) > 220) return;
    if (this.resources.wood < 50 || this.resources.stone < 35) return;
    this.resources.wood -= 50;
    this.resources.stone -= 35;
    this.addBuilding('tower', pos.x, pos.y, 230);
  }

  private updateMinimap(): void {
    this.minimapDots.forEach((d) => d.destroy());
    this.minimapDots = [];
    const mapX = 600;
    const mapY = 20;
    const w = 180;
    const h = 150;
    const now = this.time.now;
    this.buildings.forEach((b) => {
      const x = mapX + (b.sprite.x / WORLD_SIZE) * w;
      const y = mapY + (b.sprite.y / WORLD_SIZE) * h;
      const red = b.underAttackUntil > now;
      this.minimapDots.push(this.add.circle(x, y, b.kind === 'keep' ? 4 : 2.5, red ? 0xff2d2d : 0x8db8ff, 0.95).setScrollFactor(0));
    });
    this.minimapDots.push(this.add.circle(mapX + (this.player.x / WORLD_SIZE) * w, mapY + (this.player.y / WORLD_SIZE) * h, 3, 0x74ff98, 1).setScrollFactor(0));
  }

  private resourceTick(): void {
    this.buildings.forEach((b) => {
      this.resources.wood += b.generationRate.wood ?? 0;
      this.resources.stone += b.generationRate.stone ?? 0;
      this.resources.food += b.generationRate.food ?? 0;
      this.resources.gold += b.generationRate.gold ?? 0;
    });
  }

  private updateHud(): void {
    this.hudText.setText(`W ${this.resources.wood.toFixed(0)} S ${this.resources.stone.toFixed(0)} F ${this.resources.food.toFixed(0)} G ${this.resources.gold.toFixed(0)}  Houses ${this.buildings.filter((b) => b.kind === 'house').length}  View ${this.viewMode}`);
  }

  private closestBuilding(x: number, y: number): BuildingModel | undefined {
    let best: BuildingModel | undefined;
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

  private gameOver(): void {
    this.scene.pause();
    this.add.text(this.cameras.main.midPoint.x - 170, this.cameras.main.midPoint.y, 'Keep destroyed. Campaign ended.', { fontSize: '32px', color: '#ffb1b1' }).setScrollFactor(0).setDepth(100);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1a1c28',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 450 },
  scene: [MainScene]
});

// Copyright and licensed usage to Joe Wease, Founder and CEO of REALE.
