import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import FormField from './FormField.vue';

const control = {
  default: ({ describedby, invalid }: { describedby: string; invalid: boolean }) =>
    h('input', { id: 'name', 'aria-describedby': describedby, 'aria-invalid': invalid }),
};

describe('FormField', () => {
  it('labels the control and links it to its help text', () => {
    const wrapper = mount(FormField, {
      props: { id: 'name', label: 'Name', help: 'Shown to users.' },
      slots: control,
    });
    const input = wrapper.get('input');
    expect(wrapper.get('label').attributes('for')).toBe('name');
    expect(input.attributes('aria-describedby')).toBe('name-help');
    expect(input.attributes('aria-invalid')).toBe('false');
    expect(wrapper.get('#name-help').text()).toBe('Shown to users.');
  });

  it('replaces the help with the error and marks the control invalid', () => {
    const wrapper = mount(FormField, {
      props: { id: 'name', label: 'Name', help: 'Shown to users.', error: 'Required' },
      slots: { ...control, help: () => 'Custom help' },
    });
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
    const help = wrapper.get('#name-help');
    expect(help.text()).toBe('Required');
    expect(help.classes()).toContain('field__help--error');
  });

  it('renders rich help from the help slot when there is no error', () => {
    const wrapper = mount(FormField, {
      props: { id: 'name', label: 'Name' },
      slots: { ...control, help: () => h('a', { href: '/settings' }, 'Settings') },
    });
    expect(wrapper.get('#name-help a').attributes('href')).toBe('/settings');
  });
});
