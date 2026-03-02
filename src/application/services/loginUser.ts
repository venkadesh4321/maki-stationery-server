import { authService } from './authService';
import { UserRepository } from '../../domain/repositories/userRepository';
import { HttpError } from '../../interfaces/http/middlewares/httpError';

export async function loginUser(
  email: string,
  password: string,
  userRepository: UserRepository,
): Promise<{ accessToken: string; user: { id: number; name: string; email: string; role: string } }> {
  const user = await userRepository.findByEmail(email);

  if (!user || !user.isActive) {
    throw HttpError.unauthorized('Invalid credentials');
  }

  const ok = await authService.verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw HttpError.unauthorized('Invalid credentials');
  }

  const token = authService.signToken({ userId: user.id, role: user.role });

  return {
    accessToken: token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}
