import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '@sendgrid/mail';
import { KeyvService } from 'src/keyv/keyv.service';
import { MembersService } from 'src/members/members.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RoleConnectionService } from 'src/role-connection/role-connection.service';
import { emailTemplate } from './template';
import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly mailer: Transporter | undefined;

  constructor(
    private readonly db: PrismaService,
    private readonly kv: KeyvService,
    private readonly configService: ConfigService,
    private readonly roleConnectionService: RoleConnectionService,
    private readonly memberService: MembersService,
  ) {
    this.mailer = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: this.configService.getOrThrow('GMAIL_USER'),
        pass: this.configService.getOrThrow('GMAIL_PASS'),
      },
    });
  }

  async verifyEmail(email: string, id: string) {
    const token = this.generateToken();
    await this.kv.set(token, { email, userId: id });

    const host = this.configService.getOrThrow('HOST');
    const sendFrom = this.configService.getOrThrow('GMAIL_USER');

    const tokenUrl = `${host}/api/email/callback?token=${token}`;

    if (!this.mailer) throw new Error('Mailer not initialized');
    await this.mailer.sendMail({
      to: email,
      from: sendFrom,
      subject: 'Hey from ProgSoc! Verify your email for our Discord server!',
      html: emailTemplate(tokenUrl),
    });
  }

  async verifyEmailCallback(token: string, id: string) {
    const email = await this.kv.get(token);
    if (!email) {
      throw new Error('Invalid token');
    }
    if (email.userId !== id) {
      throw new Error('User ID does not match');
    }
    const isEmailMember = await this.memberService.isMember(email.email);

    const currentDateMinusOneDay = new Date();
    currentDateMinusOneDay.setDate(currentDateMinusOneDay.getDate() - 1);
    const ISO8601String = currentDateMinusOneDay.toISOString();

    await this.roleConnectionService.pushMetadata(id, {
      member: isEmailMember ? 1 : 0,
      expiry: isEmailMember?.end_date ?? ISO8601String,
    });
    await this.kv.delete(token);
  }

  private generateToken() {
    const token =
      Math.random().toString(36).substring(2, 6) +
      Math.random().toString(36).substring(2, 5);
    return token;
  }
}
